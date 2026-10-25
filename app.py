import os
import re
import secrets
import sqlite3
import time
from functools import wraps

from flask import (Flask, Response, abort, g, jsonify, redirect, render_template, request,
                   session, stream_with_context, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from model import generate

app = Flask(__name__)
app.config.update(SECRET_KEY=os.environ.get("ATHIOS_SECRET", "change-this-secret-before-deploying"),
                  SESSION_COOKIE_SAMESITE="Lax", PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 14)
DB = os.environ.get("ATHIOS_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "athios.db"))
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PAGES = {"docs": "Documentation", "privacy": "Privacy policy", "terms": "Terms", "contact": "Contact"}
ATTEMPTS = {}


# ---------- database ----------
def init_db():
    c = sqlite3.connect(DB)
    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL,
            created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
            created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, role TEXT NOT NULL,
            content TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    """)
    c.commit()
    c.close()


init_db()


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# ---------- auth helpers ----------
def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    if "user" not in g:
        g.user = db().execute("SELECT id, name, email FROM users WHERE id=?", (uid,)).fetchone()
    return g.user


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user():
            if request.path.startswith("/api/"):
                abort(401)
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)
    return wrapper


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token


def safe_next(target):
    ok = target and target.startswith("/") and not target.startswith("//") and "\\" not in target
    return target if ok else "/chat"


def throttled():
    now, ip = time.time(), request.remote_addr
    recent = [t for t in ATTEMPTS.get(ip, []) if now - t < 300] + [now]
    ATTEMPTS[ip] = recent
    return len(recent) > 10


def start_session(uid, nxt):
    session.clear()
    session["user_id"] = uid
    session.permanent = True
    return redirect(nxt)


def auth(mode):
    nxt = safe_next(request.values.get("next"))
    if current_user():
        return redirect(nxt)
    error = None
    if request.method == "POST":
        if request.form.get("csrf") != session.get("csrf"):
            abort(400)
        email = request.form.get("email", "").strip().lower()
        pw = request.form.get("password", "")
        name = request.form.get("name", "").strip()[:60]
        if throttled():
            error = "Too many attempts. Please wait a few minutes."
        elif not EMAIL.match(email):
            error = "Enter a valid email address."
        elif mode == "signup":
            if not name:
                error = "Please enter your name."
            elif len(pw) < 8:
                error = "Use at least 8 characters for your password."
            elif db().execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                error = "An account with this email already exists. Try signing in."
            else:
                cur = db().execute("INSERT INTO users (name, email, pw) VALUES (?, ?, ?)",
                                   (name, email, generate_password_hash(pw)))
                db().commit()
                return start_session(cur.lastrowid, nxt)
        else:
            row = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if row and check_password_hash(row["pw"], pw):
                return start_session(row["id"], nxt)
            error = "Incorrect email or password."
    return render_template("auth.html", mode=mode, error=error, nxt=nxt, form=request.form)


# ---------- pages ----------
@app.get("/")
def home():
    return render_template("index.html", user=current_user(), active="home")


@app.get("/products")
def products():
    return render_template("products.html", user=current_user(), active="products")


@app.get("/about")
def about():
    return render_template("about.html", user=current_user(), active="about")


@app.route("/login", methods=["GET", "POST"])
def login():
    return auth("login")


@app.route("/signup", methods=["GET", "POST"])
def signup():
    return auth("signup")


@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@app.get("/chat")
@login_required
def chat():
    return render_template("chat.html", user=current_user())


@app.route("/<page>")
def placeholder(page):
    if page not in PAGES:
        abort(404)
    return render_template("placeholder.html", title=PAGES[page], prompt="")


# ---------- chat API ----------
def own_chat(cid):
    row = db().execute("SELECT * FROM chats WHERE id=? AND owner=?", (cid, str(current_user()["id"]))).fetchone()
    if row is None:
        abort(404)
    return row


def reply_options():
    data = request.get_json(silent=True) or {}

    def num(key, low, high, default, cast):
        try:
            return min(max(cast(data.get(key, default)), low), high)
        except (TypeError, ValueError):
            return default

    return {"temperature": num("temperature", 0, 1.5, 0.7, float), "max_tokens": num("max_tokens", 20, 400, 200, int)}


def stream_reply(cid, history, text, opts):
    def run():
        parts = []
        try:
            for piece in generate(history, text, **opts):
                parts.append(piece)
                yield piece
        finally:  # also saves a partial reply if the user pressed Stop
            if parts:
                conn = sqlite3.connect(DB)
                conn.execute("INSERT INTO messages (chat_id, role, content) VALUES (?, 'assistant', ?)",
                             (cid, "".join(parts)))
                conn.commit()
                conn.close()
    return Response(stream_with_context(run()), mimetype="text/plain")


@app.get("/api/chats")
@login_required
def list_chats():
    rows = db().execute("SELECT id, title, created FROM chats WHERE owner=? ORDER BY id DESC",
                        (str(current_user()["id"]),)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/chats")
@login_required
def new_chat():
    now = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    cur = db().execute("INSERT INTO chats (owner, title, created) VALUES (?, 'New chat', ?)",
                       (str(current_user()["id"]), now))
    db().commit()
    return jsonify(id=cur.lastrowid, title="New chat", created=now), 201


@app.get("/api/chats/<int:cid>")
@login_required
def get_chat(cid):
    own_chat(cid)
    rows = db().execute("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id", (cid,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.patch("/api/chats/<int:cid>")
@login_required
def rename_chat(cid):
    own_chat(cid)
    title = ((request.get_json(silent=True) or {}).get("title") or "").strip()[:80]
    if not title:
        abort(400)
    db().execute("UPDATE chats SET title=? WHERE id=?", (title, cid))
    db().commit()
    return jsonify(id=cid, title=title)


@app.delete("/api/chats/<int:cid>")
@login_required
def delete_chat(cid):
    own_chat(cid)
    db().execute("DELETE FROM messages WHERE chat_id=?", (cid,))
    db().execute("DELETE FROM chats WHERE id=?", (cid,))
    db().commit()
    return "", 204


@app.post("/api/chats/<int:cid>/messages")
@login_required
def send_message(cid):
    chat_row = own_chat(cid)
    text = ((request.get_json(silent=True) or {}).get("content") or "").strip()[:2000]
    if not text:
        abort(400)
    d = db()
    history = [dict(r) for r in d.execute("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id", (cid,))]
    d.execute("INSERT INTO messages (chat_id, role, content) VALUES (?, 'user', ?)", (cid, text))
    if chat_row["title"] == "New chat":
        d.execute("UPDATE chats SET title=? WHERE id=?", (text[:40], cid))
    d.commit()
    return stream_reply(cid, history, text, reply_options())


@app.post("/api/chats/<int:cid>/regenerate")
@login_required
def regenerate(cid):
    own_chat(cid)
    d = db()
    last = d.execute("SELECT id, role FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1", (cid,)).fetchone()
    if last and last["role"] == "assistant":
        d.execute("DELETE FROM messages WHERE id=?", (last["id"],))
        d.commit()
    rows = [dict(r) for r in d.execute("SELECT role, content FROM messages WHERE chat_id=? ORDER BY id", (cid,))]
    if not rows or rows[-1]["role"] != "user":
        abort(400)
    return stream_reply(cid, rows[:-1], rows[-1]["content"], reply_options())


if __name__ == "__main__":
    app.run(debug=True)
