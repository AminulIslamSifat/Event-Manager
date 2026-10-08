"""
Event Khujo — development entry point.

    uv run python server.py

For production, point a WSGI server at `app:create_app()`:

    gunicorn "app:create_app()" --bind 0.0.0.0:9000
"""

import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", 9000)),
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
    )