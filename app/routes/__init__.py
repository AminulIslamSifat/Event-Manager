"""
Blueprint registry.

`register_blueprints(app)` is the single place that knows which route
modules exist, keeping app/__init__.py tidy.
"""

from . import admin, artists, auth, bookings, events, venues

BLUEPRINTS = (
    auth.bp,
    venues.bp,
    artists.bp,
    events.bp,
    bookings.bp,
    admin.bp,
)


def register_blueprints(app) -> None:
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)