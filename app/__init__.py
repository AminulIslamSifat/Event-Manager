# app factory. one place to build the app, dodges import cycles.

import os

from dotenv import load_dotenv
from flask import Flask, send_from_directory

from . import db, sync

load_dotenv()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app(config: dict | None = None) -> Flask:
    app = Flask(
        __name__,
        static_folder=os.path.join(PROJECT_ROOT, "static"),
        static_url_path="/static",
    )
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-me"),
        DATABASE=os.environ.get("DATABASE", os.path.join(PROJECT_ROOT, "events.db")),
        PW_SALT=os.environ.get("PW_SALT", "eventkhujo_salt_2026"),
        PLATFORM_FEE=float(os.environ.get("PLATFORM_FEE", 50_000)),  # BDT, dummy-paid
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        MONGODB_URI=os.environ.get("MONGODB_URI", ""),
        MONGODB_DB=os.environ.get("MONGODB_DB", "event_khujo_db"),
    )
    if config:
        app.config.update(config)

    # registered before init_db so the bootstrap ctx cleans up too
    app.teardown_appcontext(db.close_db)

    # db lifecycle
    with app.app_context():
        db.init_db()

        # cloud first. if atlas has data it wins, so replace local before anything reads.
        sync.configure(app)
        if sync.enabled():
            sync.pull_all(db.get_db())

        db.seed_reference_data()

        # empty cloud on first run -> push what we have
        if sync.enabled():
            sync.push_tables(db.get_db(), sync.SYNCED_TABLES)

    # default thumbs, only rewritten when the definition changes
    from . import thumbs
    written = thumbs.write_thumbnails(app.static_folder)
    if written:
        print(f"[thumbs] Wrote {written} default thumbnail(s).")

    # blueprints
    from .routes import register_blueprints
    register_blueprints(app)

    # index.html
    @app.route("/")
    def index():
        return send_from_directory(PROJECT_ROOT, "index.html")

    return app
