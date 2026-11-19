# Shuka API contract

All endpoints are under `/api`. JSON in/out. Auth = httpOnly cookie `sid` (send `credentials: 'include'`).
Images are served from `/uploads/...` (relative URLs, use them as given).

Errors always: `{ "error": { "code": "STRING", "message": "Human text", "details": { "field": "msg" } } }`
(`details` only on 400 validation). 400 invalid, 401 signed out, 403 forbidden, 404 not found, 409 conflict.

Money: integers in AMD (dram). Format on client as `12 500 ֏`.

## Shared shapes

```
User = { id, email, name, phone, store_name|null, is_seller: bool,
         last_address: { recipient, phone, region, city, street, apartment, note } | null }
Image = { id, position, thumb: "/uploads/..webp", large: "/uploads/..webp" }   // position 0 = main
ProductCard = { id, title, price_amd, stock, rating_avg (number 0-5), rating_count,
                image: {thumb, large} | null, seller: {id, store_name}, category: {slug, name} }
History = { from_status|null, to_status, changed_by_name, created_at }
Status = 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
```

## Auth
- `POST /api/auth/register` `{email,password,name,phone}` → `{user}` (password >= 6 chars)
- `POST /api/auth/login` `{email,password}` → `{user}`
- `POST /api/auth/logout` → `{ok:true}`
- `GET /api/me` → `{user}` or 401
- `PATCH /api/me` `{name?, phone?}` → `{user}`

## Catalog (anyone)
- `GET /api/categories` → `{categories:[{id,name,slug,product_count}]}`
- `GET /api/regions` → `{regions:["Yerevan","Aragatsotn",...]}` (11 items)
- `GET /api/products?q=&category=<slug>&minPrice=&maxPrice=&sort=newest|price_asc|price_desc|rating&page=1&limit=24`
  → `{items:[ProductCard], total, page, pages, limit}`
- `GET /api/products/:id` → `{product:{id,title,description,price_amd,stock,rating_avg,rating_count,is_published,
   created_at, category:{id,name,slug}, seller:{id,store_name}, images:[Image]}}`
- `GET /api/products/:id/reviews` → `{reviews:[{id,rating,body,created_at,buyer_name}]}` newest first
- `POST /api/products/:id/reviews` `{rating:1-5, body}` → `{review}`. 403 if user has no delivered item of it, 409 if already reviewed.

## Cart (signed in)
```
Cart = { groups:[{ seller:{id,store_name}, subtotal_amd,
           items:[{ product_id, title, image:{thumb,large}|null, price_amd (current), price_when_added,
                    quantity, stock, is_published, price_changed: bool, unavailable: bool }] }],
         total_amd, count (sum of quantities), has_issues: bool }
```
- `GET /api/cart` → Cart
- `PUT /api/cart/items/:productId` `{quantity, add?: bool}` → Cart. `add:true` adds to existing qty.
  409 `OUT_OF_STOCK` if resulting qty > stock (message says how many left). 403 `OWN_PRODUCT` for own product.
- `DELETE /api/cart/items/:productId` → Cart
- `POST /api/cart/accept-prices` → Cart (marks current prices as accepted, clears price_changed)

## Checkout (signed in)
- `POST /api/orders` `{request_key, recipient, phone, region, city, street, apartment, note?}`
  → 201 `{order:{id}}` (or 200 with the existing order if the same request_key was already used).
  409 codes: `EMPTY_CART`, `OUT_OF_STOCK` (message names product), `PRICE_CHANGED` (message names product + new price),
  `UNAVAILABLE`. 400 with `details` for missing fields.

## Buyer orders (owner only)
- `GET /api/orders` → `{orders:[{id, created_at, total_amd, item_count,
     seller_orders:[{id, status, subtotal_amd, seller:{store_name}}]}]}` newest first
- `GET /api/orders/:id` → `{order:{id, created_at, total_amd, recipient, phone, region, city, street, apartment, note,
     seller_orders:[{id, status, subtotal_amd, can_cancel: bool, seller:{id,store_name},
        items:[{id, product_id, title, unit_price_amd, quantity, image, can_review: bool, reviewed: bool}],
        history:[History] }]}}`
- `POST /api/orders/:id/sellers/:sellerOrderId/cancel` → same as GET order. 409 `BAD_TRANSITION` if shipped/delivered.

## Seller
- `POST /api/seller/activate` `{store_name, phone}` → `{user}` (409 `STORE_NAME_TAKEN`)
- `GET /api/seller/overview` → `{to_confirm, to_ship, revenue_30d, revenue_total,
     counts:{placed,confirmed,shipped,delivered,cancelled}, products_count}`
- `GET /api/seller/products` → `{products:[{id,title,price_amd,stock,is_published,units_sold,image,category:{name}}]}`
- `GET /api/seller/products/:id` → `{product: same as public product}`
- `POST /api/seller/products` `{title, category_id, description, price_amd, stock, is_published?}` → 201 `{product}`
  400 with `details` per field (title, category_id, description, price_amd, stock).
- `PATCH /api/seller/products/:id` `{...any field above}` → `{product}`. Publishing with 0 images → 400 `NO_IMAGES`.
- `POST /api/seller/products/:id/images` multipart, field name `images` (1+ files, jpeg/png/webp, <=10MB each, max 5 total)
  → `{images:[Image]}`. 400 `BAD_FILE` / `TOO_LARGE` / `TOO_MANY`.
- `DELETE /api/seller/products/:id/images/:imageId` → `{images}`
- `POST /api/seller/products/:id/images/:imageId/main` → `{images}` (moves it to position 0)
- `GET /api/seller/orders?status=` → `{orders:[{id, order_id, status, subtotal_amd, created_at, updated_at,
     recipient, region, city, item_count}], counts:{all,placed,confirmed,shipped,delivered,cancelled}}` newest first
- `GET /api/seller/orders/:id` → `{order:{id, order_id, status, subtotal_amd, created_at, buyer_name,
     recipient, phone, region, city, street, apartment, note, items:[{id,product_id,title,unit_price_amd,quantity,image}],
     history:[History], allowed:[Status]}}`  (`allowed` = buttons to show)
- `POST /api/seller/orders/:id/status` `{to}` → same as GET. 409 `BAD_TRANSITION`.

Lifecycle: placed→confirmed|cancelled, confirmed→shipped|cancelled, shipped→delivered.
