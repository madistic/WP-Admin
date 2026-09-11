-- Resolve the remaining branch-scoping blockers in the live database before re-running the migration.

WITH default_restaurant AS (
    SELECT id
    FROM "Restaurant"
    ORDER BY created_at
    LIMIT 1
),
default_branch AS (
    SELECT id, restaurant_id
    FROM "Branch"
    ORDER BY created_at
    LIMIT 1
)
UPDATE "WhatsAppCart" wc
SET restaurant_id = COALESCE(
        (
            SELECT r.id
            FROM "Restaurant" r
            WHERE r.id = wc.restaurant_id
        ),
        (SELECT id FROM default_restaurant)
    ),
    branch_id = COALESCE(
        (
            SELECT b.id
            FROM "Branch" b
            WHERE b.restaurant_id = wc.restaurant_id
              AND b.code = 'MAIN'
            ORDER BY b.created_at
            LIMIT 1
        ),
        (
            SELECT b.id
            FROM "Branch" b
            WHERE b.restaurant_id = (
                SELECT id FROM default_restaurant
            )
            ORDER BY b.created_at
            LIMIT 1
        )
    )
WHERE wc.branch_id IS NULL
   OR NOT EXISTS (
      SELECT 1
      FROM "Restaurant" r
      WHERE r.id = wc.restaurant_id
    );

WITH ranked_orders AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY restaurant_id, branch_id, client_request_id
               ORDER BY created_at, id
           ) AS rn
    FROM "Order"
    WHERE client_request_id IS NOT NULL
)
DELETE FROM "Order" o
USING ranked_orders r
WHERE o.id = r.id
  AND r.rn > 1;
