from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Database Configuration
# This creates a file named 'expenseiq.db' in your project folder
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expenseiq.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- DATABASE MODELS ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)

class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    date = db.Column(db.String(20), nullable=False)

# --- PAGE ROUTERS (Serving HTML) ---

@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/register.html')
def register_page():
    return render_template('register.html')

@app.route('/login.html')
def login_page():
    return render_template('login.html')

@app.route('/add-expense.html')
def add_expense_page():
    return render_template('add-expense.html')

@app.route('/budget.html')
def budget_page():
    return render_template('budget.html')

# --- API ENDPOINTS (Logic for script.js) ---

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"message": "User already exists"}), 400
    
    new_user = User(name=data['name'], email=data['email'], password=data['password'])
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({
        "token": "demo-token-123",
        "user": {"name": new_user.name, "email": new_user.email}
    }), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data['email'], password=data['password']).first()
    
    if user:
        return jsonify({
            "token": "demo-token-123",
            "user": {"name": user.name, "email": user.email}
        }), 200
    return jsonify({"message": "Invalid credentials"}), 401

@app.route('/expenses', methods=['POST', 'GET'])
def handle_expenses():
    if request.method == 'POST':
        data = request.json
        new_exp = Expense(
            description=data['description'],
            amount=data['amount'],
            category=data['category'],
            date=data['date']
        )
        db.session.add(new_exp)
        db.session.commit()
        return jsonify({"message": "Expense saved!"}), 201
    
    # GET method for the dashboard
    expenses = Expense.query.order_by(Expense.id.desc()).all()
    return jsonify([{
        "id": e.id, "description": e.description, 
        "amount": e.amount, "category": e.category, "date": e.date
    } for e in expenses])

@app.route('/predict-category', methods=['POST'])
def predict():
    desc = request.json.get('description', '').lower()
    # Basic logic for the auto-categorization feature
    category = "other"
    if any(word in desc for word in ["food", "lunch", "dinner", "pizza", "zomato"]): 
        category = "food"
    elif any(word in desc for word in ["uber", "ola", "petrol", "fuel", "bus"]): 
        category = "transport"
    elif any(word in desc for word in ["amazon", "flipkart", "dress", "shirt"]): 
        category = "shopping"
    
    return jsonify({"category": category})

@app.route('/dashboard/summary', methods=['GET'])
def get_summary():
    expenses = Expense.query.all()
    total = sum(e.amount for e in expenses)
    # You can expand this to calculate actual remaining budget later
    return jsonify({
        "total_expense": total,
        "remaining": 60000 - total,
        "budget": 60000,
        "top_category": "Food"
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all() # Automatically creates the database and tables
    app.run(port=5000, debug=True)
