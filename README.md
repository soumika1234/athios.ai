# Athios website (Flask)

Pages: Home `/`, Products `/products`, About `/about`, Sign in `/login`, Sign up `/signup`, Chat `/chat`.

## Run
    python -m venv venv
    venv\Scripts\activate          (Windows)   |   source venv/bin/activate   (macOS/Linux)
    pip install -r requirements.txt
    python app.py                    -> http://127.0.0.1:5000

## Commit to GitHub from VS Code
1. Source Control (Ctrl+Shift+G) > Initialize Repository.
2. Type a message, click Commit (choose "Yes" to stage all changes).
3. Click Publish Branch and sign in to GitHub. Pick Private or Public.
Later changes: edit, commit, then Sync Changes. `.gitignore` keeps `venv/` and `*.db` (accounts and chats) out of GitHub.

## Notes
- Accounts and chats are stored in `athios.db` (SQLite).
- `model.py` holds the demo responder. Replace `generate()` with the trained Athios model.
- Set `ATHIOS_SECRET` to a long random string before deploying.
