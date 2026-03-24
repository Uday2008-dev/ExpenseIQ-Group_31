from flask import Flask, render_template, request, redirect
import sqlite3

app = Flask(__name__)

# Create database
def init_db():
    conn = sqlite3.connect("expenses.db")
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            amount REAL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budget (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL
        )
    """)

    conn.commit()
    conn.close()

init_db()

@app.route("/")
def home():
    conn = sqlite3.connect("expenses.db")
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM expenses")
    expenses = cursor.fetchall()

    cursor.execute("SELECT SUM(amount) FROM expenses")
    total = cursor.fetchone()[0]
    if total is None:
        total = 0

    cursor.execute("SELECT amount FROM budget")
    budget_data = cursor.fetchone()

    budget = budget_data[0] if budget_data else 0

    money_left = budget - total
    percentage = (total / budget * 100) if budget > 0 else 0

    conn.close()

    return render_template("index.html",
                           expenses=expenses,
                           total=total,
                           budget=budget,
                           money_left=money_left,
                           percentage=round(percentage, 2))

@app.route("/set_budget", methods=["POST"])
def set_budget():
    amount = request.form["budget"]

    conn = sqlite3.connect("expenses.db")
    cursor = conn.cursor()

    cursor.execute("DELETE FROM budget")  # keep only one budget
    cursor.execute("INSERT INTO budget (amount) VALUES (?)", (amount,))

    conn.commit()
    conn.close()

    return redirect("/")


@app.route("/add", methods=["GET", "POST"])
def add():
    if request.method == "POST":
        title = request.form["title"]
        amount = request.form["amount"]

        conn = sqlite3.connect("expenses.db")
        cursor = conn.cursor()
        cursor.execute("INSERT INTO expenses (title, amount) VALUES (?, ?)", (title, amount))
        conn.commit()
        conn.close()

        return redirect("/")

    return render_template("add.html")


if __name__ == "__main__":
    app.run(debug=True)