import os
import sqlite3
import uuid
import hmac
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, g


APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, 'expenseiq.db')

# Simple HMAC-signed token (not JWT) to avoid extra dependencies.
SECRET = os.environ.get('EXPENSEIQ_SECRET', 'change-me-in-production')
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

CATEGORIES = {
    'food', 'transport', 'shopping', 'utilities', 'health',
    'entertainment', 'education', 'other'
}


def create_app():
    app = Flask(__name__)

    def get_db():
        if 'db' not in g:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            g.db = conn
        return g.db

    @app.teardown_appcontext
    def close_db(_=None):
        db = g.pop('db', None)
        if db is not None:
            db.close()

    def init_db():
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS budgets (
                user_id INTEGER PRIMARY KEY,
                total REAL NOT NULL,
                food REAL NOT NULL,
                transport REAL NOT NULL,
                shopping REAL NOT NULL,
                utilities REAL NOT NULL,
                health REAL NOT NULL,
                entertainment REAL NOT NULL,
                education REAL NOT NULL,
                other REAL NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                is_anomaly INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        conn.commit()
        conn.close()

    # ---- Token helpers ----
    def _sign(payload: str) -> str:
        return hmac.new(SECRET.encode('utf-8'), payload.encode('utf-8'), digestmod='sha256').hexdigest()

    def make_token(user_id: int) -> str:
        exp = int(time.time()) + TOKEN_TTL_SECONDS
        jti = uuid.uuid4().hex
        payload = f"{user_id}.{exp}.{jti}"
        sig = _sign(payload)
        return f"{payload}.{sig}"

    def parse_token(token: str):
        try:
            # Expected token format:
            # userId.exp.jti.signature  (4 parts)
            parts = token.split('.')
            if len(parts) != 4:
                return None
            user_id_s, exp_s, jti, sig = parts
        except Exception:
            return None

        payload = f"{user_id_s}.{exp_s}.{jti}"
        expected = _sign(payload)
        if not hmac.compare_digest(expected, sig):
            return None

        if int(exp_s) < int(time.time()):
            return None

        try:
            return int(user_id_s)
        except Exception:
            return None

    def get_auth_user():
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return None
        token = auth.split(' ', 1)[1].strip()
        user_id = parse_token(token)
        if not user_id:
            return None
        db = get_db()
        u = db.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,)).fetchone()
        if not u:
            return None
        return u

    def require_auth(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            u = get_auth_user()
            if not u:
                return jsonify({'message': 'Unauthorized'}), 401
            g.user = u
            return f(*args, **kwargs)

        return wrapper

    def hash_password(password: str) -> str:
        # Lightweight hash without extra libs.
        # NOTE: For production use bcrypt/argon2.
        # Using HMAC as a stand-in for salted hashing.
        salt = 'expensesiq-salt'
        return hmac.new((salt + SECRET).encode('utf-8'), password.encode('utf-8'), digestmod='sha256').hexdigest()

    def ensure_budget_row(user_id: int):
        db = get_db()
        row = db.execute('SELECT user_id FROM budgets WHERE user_id = ?', (user_id,)).fetchone()
        if row:
            return
        # Defaults matching front-end demo-ish values
        now = datetime.utcnow().isoformat()
        defaults = {
            'total': 60000,
            'food': 15000,
            'transport': 8000,
            'shopping': 10000,
            'utilities': 5000,
            'health': 8000,
            'entertainment': 5000,
            'education': 5000,
            'other': 4000,
        }
        db.execute(
            """
            INSERT INTO budgets (user_id, total, food, transport, shopping, utilities, health, entertainment, education, other, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                defaults['total'],
                defaults['food'],
                defaults['transport'],
                defaults['shopping'],
                defaults['utilities'],
                defaults['health'],
                defaults['entertainment'],
                defaults['education'],
                defaults['other'],
                now,
            ),
        )
        db.commit()

    @app.get('/health')
    def health():
        return jsonify({'ok': True})

    # ---- Auth ----
    @app.post('/register')
    def register():
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not name or not email or not password:
            return jsonify({'message': 'Missing fields'}), 400
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters'}), 400

        db = get_db()
        pw_hash = hash_password(password)
        try:
            cur = db.execute(
                'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
                (name, email, pw_hash, datetime.utcnow().isoformat()),
            )
            user_id = cur.lastrowid
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({'message': 'Email already registered'}), 409

        ensure_budget_row(user_id)
        token = make_token(user_id)
        user = db.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,)).fetchone()
        return jsonify({'token': token, 'user': {'name': user['name'], 'email': user['email']}})

    @app.post('/login')
    def login():
        data = request.get_json(silent=True) or {}
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not email or not password:
            return jsonify({'message': 'Missing fields'}), 400

        db = get_db()
        user = db.execute('SELECT id, name, email, password_hash FROM users WHERE email = ?', (email,)).fetchone()
        if not user:
            return jsonify({'message': 'Invalid credentials'}), 401

        if user['password_hash'] != hash_password(password):
            return jsonify({'message': 'Invalid credentials'}), 401

        token = make_token(user['id'])
        return jsonify({'token': token, 'user': {'name': user['name'], 'email': user['email']}})

    # ---- Category prediction & anomaly ----
    @app.post('/predict-category')
    @require_auth
    def predict_category():
        data = request.get_json(silent=True) or {}
        desc = (data.get('description') or '').strip().lower()
        if not desc:
            return jsonify({'message': 'Missing description'}), 400

        # Mirror the front-end simple keyword predictor.
        import re

        def match_any(patterns):
            return any(re.search(p, desc, re.IGNORECASE) for p in patterns)

        if match_any([r'food|eat|restaurant|cafe|pizza|burger|lunch|dinner|grocery|swiggy|zomato']):
            cat = 'food'
        elif match_any([r'uber|ola|bus|auto|metro|petrol|fuel|cab|taxi']):
            cat = 'transport'
        elif match_any([r'amazon|flipkart|shop|buy|cloth|dress|shoe|mall']):
            cat = 'shopping'
        elif match_any([r'electricity|water|wifi|internet|bill|recharge']):
            cat = 'utilities'
        elif match_any([r'doctor|hospital|medicine|pharmacy|clinic|health']):
            cat = 'health'
        elif match_any([r'netflix|movie|cinema|game|spotify|subscription']):
            cat = 'entertainment'
        elif match_any([r'book|course|college|school|tuition|education']):
            cat = 'education'
        else:
            cat = 'other'

        if cat not in CATEGORIES:
            cat = 'other'
        return jsonify({'category': cat})

    @app.post('/check-anomaly')
    @require_auth
    def check_anomaly():
        data = request.get_json(silent=True) or {}
        amount = data.get('amount')
        category = (data.get('category') or 'other').lower()

        try:
            amount = float(amount)
        except Exception:
            return jsonify({'message': 'Invalid amount'}), 400

        if category not in CATEGORIES:
            category = 'other'

        # Simple statistical anomaly: amount > mean(category)*2.5 or > 100000 (hard cap)
        db = get_db()
        row = db.execute(
            'SELECT avg(amount) AS avg_amount FROM expenses WHERE user_id = ? AND category = ?',
            (g.user['id'], category),
        ).fetchone()
        avg_amount = row['avg_amount'] if row and row['avg_amount'] is not None else None

        is_anomaly = False
        if avg_amount is not None and avg_amount > 0:
            if amount > (avg_amount * 2.5):
                is_anomaly = True
        if amount >= 100000:
            is_anomaly = True

        return jsonify({'is_anomaly': bool(is_anomaly)})

    # ---- Expenses CRUD ----
    @app.get('/expenses')
    @require_auth
    def list_expenses():
        db = get_db()
        exps = db.execute(
            'SELECT id, description, category, amount, date, is_anomaly FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 200',
            (g.user['id'],),
        ).fetchall()

        out = [
            {
                'id': r['id'],
                'description': r['description'],
                'category': r['category'],
                'amount': r['amount'],
                'date': r['date'],
                'is_anomaly': bool(r['is_anomaly']),
            }
            for r in exps
        ]
        return jsonify(out)

    @app.post('/expenses')
    @require_auth
    def add_expense():
        data = request.get_json(silent=True) or {}

        try:
            amount = float(data.get('amount'))
        except Exception:
            return jsonify({'message': 'Invalid amount'}), 400

        description = (data.get('description') or '').strip()
        category = (data.get('category') or 'other').strip().lower()
        date_str = (data.get('date') or '').strip()

        if not description or not date_str:
            return jsonify({'message': 'Missing fields'}), 400
        if amount <= 0:
            return jsonify({'message': 'Amount must be > 0'}), 400
        if category not in CATEGORIES:
            category = 'other'

        # Optional anomaly based on stored history.
        row = None
        db = get_db()
        row = db.execute(
            'SELECT avg(amount) AS avg_amount FROM expenses WHERE user_id = ? AND category = ?',
            (g.user['id'], category),
        ).fetchone()
        avg_amount = row['avg_amount'] if row and row['avg_amount'] is not None else None

        is_anomaly = 0
        if avg_amount is not None and avg_amount > 0:
            if amount > (avg_amount * 2.5):
                is_anomaly = 1
        if amount >= 100000:
            is_anomaly = 1

        db.execute(
            'INSERT INTO expenses (user_id, description, category, amount, date, is_anomaly, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (g.user['id'], description, category, amount, date_str, is_anomaly, datetime.utcnow().isoformat()),
        )
        db.commit()
        return jsonify({'message': 'Expense added', 'ok': True})

    @app.delete('/expenses/<int:expense_id>')
    @require_auth
    def delete_expense(expense_id: int):
        db = get_db()
        res = db.execute(
            'DELETE FROM expenses WHERE id = ? AND user_id = ?',
            (expense_id, g.user['id']),
        )
        db.commit()
        return jsonify({'message': 'Deleted', 'ok': True})

    # ---- Budget ----
    @app.get('/budget')
    @require_auth
    def get_budget():
        ensure_budget_row(g.user['id'])
        db = get_db()
        r = db.execute(
            'SELECT total, food, transport, shopping, utilities, health, entertainment, education, other FROM budgets WHERE user_id = ?',
            (g.user['id'],),
        ).fetchone()
        return jsonify(dict(r))

    @app.post('/budget')
    @require_auth
    def set_budget():
        data = request.get_json(silent=True) or {}

        def f(x, default=0.0):
            try:
                return float(x)
            except Exception:
                return float(default)

        total = f(data.get('total'), 60000)
        # categories: front-end sends budget object with keys food, transport, ...
        budget_fields = ['food', 'transport', 'shopping', 'utilities', 'health', 'entertainment', 'education', 'other']
        values = {k: f(data.get(k), 0.0) for k in budget_fields}

        ensure_budget_row(g.user['id'])
        db = get_db()
        now = datetime.utcnow().isoformat()
        db.execute(
            """
            UPDATE budgets SET
              total = ?,
              food = ?, transport = ?, shopping = ?, utilities = ?, health = ?,
              entertainment = ?, education = ?, other = ?,
              updated_at = ?
            WHERE user_id = ?
            """,
            (
                total,
                values['food'],
                values['transport'],
                values['shopping'],
                values['utilities'],
                values['health'],
                values['entertainment'],
                values['education'],
                values['other'],
                now,
                g.user['id'],
            ),
        )
        db.commit()
        return jsonify({'ok': True})

    # ---- Dashboard endpoints ----
    @app.get('/dashboard/summary')
    @require_auth
    def dashboard_summary():
        db = get_db()
        ensure_budget_row(g.user['id'])

        # Total expense, remaining vs budgets.total
        budget = db.execute(
            'SELECT * FROM budgets WHERE user_id = ?',
            (g.user['id'],),
        ).fetchone()

        expenses = db.execute(
            'SELECT amount, category, date FROM expenses WHERE user_id = ?',
            (g.user['id'],),
        ).fetchall()

        total_expense = sum(r['amount'] for r in expenses) if expenses else 0.0
        remaining = float(budget['total']) - float(total_expense)
        budget_exceeded = remaining < 0

        # Top category by spend
        cat_totals = {}
        for r in expenses:
            c = (r['category'] or 'other').capitalize()
            cat_totals[c] = cat_totals.get(c, 0.0) + float(r['amount'])
        top_category = max(cat_totals, key=cat_totals.get) if cat_totals else 'Other'

        return jsonify({
            'total_expense': round(total_expense, 2),
            'budget': float(budget['total']),
            'remaining': round(remaining, 2),
            'budget_exceeded': bool(budget_exceeded),
            'top_category': top_category,
        })

    @app.get('/forecast')
    @require_auth
    def forecast():
        # Lightweight forecast: use last 6 months average + bias.
        db = get_db()
        today = datetime.utcnow().date()

        # Group by month
        rows = db.execute(
            """
            SELECT strftime('%Y-%m', date) AS ym, SUM(amount) AS total
            FROM expenses
            WHERE user_id = ?
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 6
            """,
            (g.user['id'],),
        ).fetchall()

        totals = [float(r['total']) for r in rows][::-1]  # oldest -> newest
        if not totals:
            return jsonify({'forecast': 0})

        avg = sum(totals) / len(totals)
        forecast_amount = avg * 1.07  # slight upward bias
        return jsonify({'forecast': round(forecast_amount, 2)})

    @app.get('/monthly-trend')
    @require_auth
    def monthly_trend():
        # Not called by current frontend, but useful if you extend.
        db = get_db()
        rows = db.execute(
            """
            SELECT strftime('%b', date) AS mon, strftime('%Y-%m', date) AS ym, SUM(amount) AS total
            FROM expenses
            WHERE user_id = ?
            GROUP BY ym
            ORDER BY ym DESC
            LIMIT 6
            """,
            (g.user['id'],),
        ).fetchall()
        # rows are newest->oldest
        rows = list(rows)[::-1]
        labels = [r['mon'] for r in rows]
        values = [float(r['total']) for r in rows]
        return jsonify({'labels': labels, 'values': values})

    # Render a compatible line trend data for current JS usage:
    # Frontend expects /dashboard/summary to return charts by itself via /expenses + MOCK.monthly_trend.
    # It uses MOCK.monthly_trend always for line chart currently.

    init_db()

    return app


app = create_app()

if __name__ == '__main__':
    # Bind to all interfaces so frontend can call using localhost/127.0.0.1
    # and in some setups HTTPS/proxy tooling.
    app.run(host='0.0.0.0', port=5000, debug=True)

