# blueprint registry. the one place that knows which route modules exist.

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