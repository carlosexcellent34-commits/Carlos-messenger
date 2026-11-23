from flask import Flask, render_template, request, redirect, session, url_for
import sqlite3, os

app = Flask(__name__)
app.secret_key = "carlos-secret-123"

# Database setup
def get_db():
    conn = sqlite3.connect('carlos.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS users
    (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, pic TEXT, bio TEXT)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS messages
    (id INTEGER PRIMARY KEY, sender TEXT, receiver TEXT, text TEXT)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS news
    (id INTEGER PRIMARY KEY, user TEXT, text TEXT)''')
    # Admin account
    try:
        conn.execute("INSERT INTO users (name,email,password,pic,bio) VALUES (?,?,?,?,?)",
        ("Admin","admin@carlos.com","admin123","default.png","Carlos Admin"))
    except: pass
    conn.commit()

init_db()

@app.route('/')
def home():
    if 'email' not in session:
        return redirect('/login')
    return render_template('home.html', user=session['email'])

@app.route('/register', methods=['GET','POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email'] # Gmail login
        password = request.form['password']
        conn = get_db()
        try:
            conn.execute("INSERT INTO users (name,email,password,pic) VALUES (?,?,?,?)",
            (name,email,password,"default.png"))
            conn.commit()
            return redirect('/login')
        except:
            return "Email don dey used before!"
    return render_template('register.html')

@app.route('/login', methods=['GET','POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE email=? AND password=?",
        (email,password)).fetchone()
        if user:
            session['email'] = email
            session['name'] = user['name']
            # Admin check
            if email == "admin@carlos.com":
                return redirect('/admin')
            return redirect('/')
        return "Wrong Gmail or password!"
    return render_template('login.html')

@app.route('/chat/<friend>', methods=['GET','POST'])
def chat(friend):
    if 'email' not in session: return redirect('/login')
    conn = get_db()
    if request.method == 'POST':
        conn.execute("INSERT INTO messages (sender,receiver,text) VALUES (?,?,?)",
        (session['email'], friend, request.form['text']))
        conn.commit()
    msgs = conn.execute("SELECT * FROM messages WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)",
    (session['email'],friend,friend,session['email'])).fetchall()
    return redirect(request.url) if request.method=='POST' else render_template('chat.html', msgs=msgs, friend=friend)

@app.route('/profile', methods=['GET','POST'])
def profile():
    if 'email' not in session: return redirect('/login')
    conn = get_db()
    if request.method == 'POST':
        conn.execute("UPDATE users SET name=?, bio=? WHERE email=?",
        (request.form['name'], request.form['bio'], session['email']))
        conn.commit()
    user = conn.execute("SELECT * FROM users WHERE email=?", (session['email'],)).fetchone()
    return render_template('profile.html', user=user)

@app.route('/news', methods=['GET','POST'])
def news():
    if 'email' not in session: return redirect('/login')
    conn = get_db()
    if request.method == 'POST':
        conn.execute("INSERT INTO news (user,text) VALUES (?,?)",
        (session['email'], request.form['text']))
        conn.commit()
    all_news = conn.execute("SELECT * FROM news ORDER BY id DESC").fetchall()
    return render_template('news.html', news=all_news)

@app.route('/admin')
def admin():
    if session.get('email') != "admin@carlos.com":
        return "You no be admin!"
    conn = get_db()
    users = conn.execute("SELECT * FROM users").fetchall()
    msgs = conn.execute("SELECT * FROM messages").fetchall()
    return render_template('admin.html', users=users, msgs=msgs)

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)	
