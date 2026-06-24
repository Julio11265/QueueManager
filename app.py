import os
from datetime import date
from urllib.parse import urlparse, urlunparse

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

load_dotenv()


def normalize_database_url(url: str | None) -> str:
    """Neon/Render URLs often start with postgresql:// or postgres://.
    This app installs psycopg v3, so SQLAlchemy must use postgresql+psycopg://.
    """
    if not url:
        return "sqlite:///queue_manager.db"
    if url.startswith("postgresql+psycopg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = normalize_database_url(os.getenv("DATABASE_URL"))
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db_uri = app.config["SQLALCHEMY_DATABASE_URI"]
if db_uri.startswith("sqlite"):
    print("Using database: SQLite local file")
else:
    print("Using database: Postgres/Neon")

# Required by many hosted Postgres providers such as Neon.
if app.config["SQLALCHEMY_DATABASE_URI"].startswith("postgresql"):
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "connect_args": {"sslmode": "require"},
    }


db = SQLAlchemy(app)


class AgentRow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    out_of_office = db.Column(db.Boolean, nullable=False, default=False)
    on_p1 = db.Column(db.Boolean, nullable=False, default=False)
    easy = db.Column(db.Integer, nullable=True)
    investigation = db.Column(db.Integer, nullable=True)
    autoclose = db.Column(db.Integer, nullable=True)
    emea_handovers = db.Column(db.Text, nullable=True)
    jobs_p1 = db.Column(db.Text, nullable=True)

    def as_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position,
            "out_of_office": self.out_of_office,
            "on_p1": self.on_p1,
            "easy": self.easy,
            "investigation": self.investigation,
            "autoclose": self.autoclose,
            "emea_handovers": self.emea_handovers or "",
            "jobs_p1": self.jobs_p1 or "",
        }


DEFAULT_AGENTS = ["Carlos", "Victor", "Julio", "Cristian"]


def seed_agents() -> None:
    existing = {row.name for row in AgentRow.query.all()}
    for index, name in enumerate(DEFAULT_AGENTS):
        if name not in existing:
            db.session.add(AgentRow(name=name, position=index))
    db.session.commit()


with app.app_context():
    db.create_all()
    seed_agents()


@app.get("/")
def index():
    rows = AgentRow.query.order_by(AgentRow.position.asc(), AgentRow.id.asc()).all()
    return render_template("index.html", rows=rows, today=date.today().strftime("%d/%m/%Y"))


@app.get("/api/rows")
def get_rows():
    rows = AgentRow.query.order_by(AgentRow.position.asc(), AgentRow.id.asc()).all()
    return jsonify([row.as_dict() for row in rows])


@app.post("/api/rows/<int:row_id>")
def update_row(row_id: int):
    row = AgentRow.query.get_or_404(row_id)
    payload = request.get_json(force=True)

    for field in ["out_of_office", "on_p1"]:
        if field in payload:
            setattr(row, field, bool(payload[field]))

    for field in ["easy", "investigation", "autoclose"]:
        if field in payload:
            value = payload[field]
            setattr(row, field, None if value in ("", None) else int(value))

    for field in ["emea_handovers", "jobs_p1"]:
        if field in payload:
            setattr(row, field, payload[field] or "")

    db.session.commit()
    return jsonify(row.as_dict())


@app.post("/api/reorder")
def reorder_rows():
    payload = request.get_json(force=True)
    ordered_ids = payload.get("ordered_ids", [])
    rows_by_id = {row.id: row for row in AgentRow.query.all()}

    for position, row_id in enumerate(ordered_ids):
        row = rows_by_id.get(int(row_id))
        if row:
            row.position = position

    db.session.commit()
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True)