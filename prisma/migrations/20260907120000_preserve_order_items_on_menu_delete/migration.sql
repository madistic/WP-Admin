ALTER TABLE "OrderItem" ALTER COLUMN "menu_item_id" DROP NOT NULL;

ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_menu_item_id_fkey";

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "MenuItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
