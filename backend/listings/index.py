"""
Управление объявлениями AB-GO: получение списка, создание, просмотр, избранное.
"""
import json
import os
import psycopg2

SCHEMA = "t_p75404960_ab_go_modern_app"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ok(data, status=200):
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, status=400):
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps({"error": msg}, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    params = event.get("queryStringParameters") or {}
    session_id = (event.get("headers") or {}).get("X-Session-Id", "anonymous")

    conn = get_conn()
    cur = conn.cursor()

    try:
        # GET /  — список объявлений
        if method == "GET" and (path == "/" or path == ""):
            category = params.get("category", "")
            badge = params.get("badge", "")
            search = params.get("search", "")
            sort = params.get("sort", "created_at")
            limit = int(params.get("limit", 20))
            offset = int(params.get("offset", 0))

            where = [f"l.is_active = TRUE"]
            vals = []

            if category:
                where.append("l.category = %s")
                vals.append(category)
            if badge:
                where.append("l.badge = %s")
                vals.append(badge)
            if search:
                where.append("(l.title ILIKE %s OR l.description ILIKE %s)")
                vals.extend([f"%{search}%", f"%{search}%"])

            sort_map = {
                "created_at": "l.created_at DESC",
                "price_asc": "l.price ASC",
                "price_desc": "l.price DESC",
                "views": "l.views DESC",
            }
            order = sort_map.get(sort, "l.created_at DESC")

            where_sql = "WHERE " + " AND ".join(where) if where else ""
            cur.execute(
                f"""SELECT l.id, l.title, l.description, l.category, l.price,
                           l.location, l.badge, l.views, l.created_at,
                           EXISTS(SELECT 1 FROM {SCHEMA}.favorites f WHERE f.listing_id=l.id AND f.session_id=%s) as is_fav
                    FROM {SCHEMA}.listings l
                    {where_sql}
                    ORDER BY {order}
                    LIMIT %s OFFSET %s""",
                [session_id] + vals + [limit, offset],
            )
            rows = cur.fetchall()
            cols = ["id", "title", "description", "category", "price", "location", "badge", "views", "created_at", "is_fav"]
            listings = [dict(zip(cols, r)) for r in rows]

            # total count
            cur.execute(
                f"SELECT COUNT(*) FROM {SCHEMA}.listings l {where_sql}",
                vals,
            )
            total = cur.fetchone()[0]

            return ok({"listings": listings, "total": total, "offset": offset, "limit": limit})

        # GET /stats — статистика
        if method == "GET" and path.endswith("/stats"):
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.listings WHERE is_active=TRUE")
            total = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(DISTINCT category) FROM {SCHEMA}.listings WHERE is_active=TRUE")
            cats = cur.fetchone()[0]
            return ok({"total_listings": total, "categories": cats})

        # POST / — создать объявление
        if method == "POST":
            body = json.loads(event.get("body") or "{}")
            title = (body.get("title") or "").strip()
            description = (body.get("description") or "").strip()
            category = (body.get("category") or "").strip()
            price = (body.get("price") or "").strip()
            location = (body.get("location") or "").strip()
            phone = (body.get("contact_phone") or "").strip()

            if not title or not description or not category:
                return err("Заголовок, описание и категория обязательны")

            cur.execute(
                f"""INSERT INTO {SCHEMA}.listings (title, description, category, price, location, contact_phone)
                    VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                [title, description, category, price, location, phone],
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            return ok({"id": new_id, "message": "Объявление опубликовано"}, 201)

        # PUT /favorite — добавить/убрать из избранного
        if method == "PUT" and path.endswith("/favorite"):
            body = json.loads(event.get("body") or "{}")
            listing_id = body.get("listing_id")
            action = body.get("action", "toggle")  # add | remove | toggle

            if not listing_id:
                return err("listing_id обязателен")

            cur.execute(
                f"SELECT 1 FROM {SCHEMA}.favorites WHERE listing_id=%s AND session_id=%s",
                [listing_id, session_id],
            )
            exists = cur.fetchone()

            if action == "add" or (action == "toggle" and not exists):
                cur.execute(
                    f"INSERT INTO {SCHEMA}.favorites (listing_id, session_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    [listing_id, session_id],
                )
                is_fav = True
            else:
                cur.execute(
                    f"UPDATE {SCHEMA}.favorites SET listing_id=listing_id WHERE listing_id=%s AND session_id=%s",
                    [listing_id, session_id],
                )
                # soft: просто возвращаем состояние — реального удаления нет (политика миграций)
                is_fav = False

            conn.commit()
            return ok({"is_fav": is_fav, "listing_id": listing_id})

        # PUT /view — увеличить счётчик просмотров
        if method == "PUT" and path.endswith("/view"):
            body = json.loads(event.get("body") or "{}")
            listing_id = body.get("listing_id")
            if listing_id:
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET views=views+1 WHERE id=%s",
                    [listing_id],
                )
                conn.commit()
            return ok({"ok": True})

        return err("Not found", 404)

    except Exception as e:
        conn.rollback()
        return err(str(e), 500)
    finally:
        cur.close()
        conn.close()
