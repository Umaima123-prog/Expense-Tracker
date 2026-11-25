# Code review: `before.js` → `after.js`

`before.js` is a notes API (Express + Mongoose) written the way a quick AI answer often looks.
It works when everything goes right, but it has several problems. `after.js` is the fixed version.

---

## 1. Saving `req.body` straight into the database (mass assignment)

**Problem:** `Note.create(req.body)` and `findByIdAndUpdate(id, req.body)` save whatever the client sends.

**Why it is dangerous:** A user can set fields they should never control. For example, they can send
`"owner": "someone-else"` to put a note in another user's account, or change `createdAt` or `_id`.

**Fix:** A small `pickAllowed()` function copies only `title`, `content` and `isPinned`.
The server sets `owner` itself from the logged-in user. Timestamps are handled by Mongoose.

---

## 2. No authentication or ownership check

**Problem:** None of the routes check who is calling. Every note in the database is public.

**Why it is dangerous:** Anyone on the internet can read, change or delete every user's notes.

**Fix:** The `requireAuth` middleware checks a JWT token on every request and stores the user's id in
`req.user`. Every database query also includes `owner: req.user.id`, so users can only see or change
their own notes. Another user's note returns 404, so attackers can't even tell that it exists.

---

## 3. Poor error handling and leaking internal errors

**Problem:**
- GET list, GET one and DELETE have no `try/catch`. If the database throws, the promise rejection is
  not handled (in Express 4), so the request just hangs until it times out, and the process may crash.
- POST returns the raw error object (`res.json(err)`) and PUT returns `err.stack`.

**Why it is dangerous:** Hanging requests and crashes make the app unreliable. Stack traces and raw
errors show attackers file paths, library versions and database details that help them plan an attack.

**Fix:** Every route is wrapped in `asyncHandler`, which passes errors to one central error handler.
That handler returns a 400 with readable messages for validation errors. For anything else, it logs
the details on the server and sends the client only `"Internal server error"`.

---

## 4. No schema validation

**Problem:** The schema only says "this is a String". Empty titles, missing titles, or a huge 50 MB
`content` are all accepted.

**Why it is dangerous:** Bad data ends up in the database, and very large inputs waste storage and
memory. Someone could even fill the database on purpose.

**Fix:** `title` is required, trimmed, and at most 200 characters. `content` is at most 10,000 characters.
`owner` is a required ObjectId.

---

## 5. Invalid ids and missing 404 (GET one, and also PUT and DELETE)

**Problem:** An id like `/notes/abc` makes Mongoose throw a `CastError`, which is unhandled in GET/DELETE
and turns into a 500 in PUT. When the id is valid but the note doesn't exist, GET returns
`200` with `null`, and DELETE says "Note deleted" even though nothing was deleted.

**Why it is dangerous:** The client gets wrong or confusing answers ("success" when nothing happened),
and malformed input causes server errors.

**Fix:** `router.param('id', ...)` checks the id format once for all routes and returns 400 if it is invalid.
GET, PUT and DELETE return 404 when no note is found.

---

## 6. PUT update problems

**Problem:** `findByIdAndUpdate` returns the **old** note by default. It also **skips schema validation**
on updates, and returns `200 null` when the note doesn't exist.

**Why it is dangerous:** The client thinks the update failed or shows stale data. Even after validation
is added to the schema, users could still save an empty title through PUT, because updates skip it.

**Fix:** Uses `{ new: true, runValidators: true }` and `$set` with only the allowed fields. Returns 400
if no valid fields are sent, and 404 if the note is missing.

---

## 7. No limit on the list size

**Problem:** `GET /notes` returns **every** note in one response.

**Why it is dangerous:** As the database grows, a single request can load huge amounts of data into
memory and slow down or crash the server. An attacker can also do this on purpose by calling it repeatedly.

**Fix:** Pagination with `?page=` and `?limit=`. The default is 20 and the maximum is 100.

---

## 8. Regex injection in search (ReDoS)

**Problem:** `new RegExp(req.query.search)` turns user text directly into a regular expression.

**Why it is dangerous:**
- Some patterns, such as `(a+)+$`, take an extremely long time to evaluate. This is called
  "Regular expression Denial of Service" (ReDoS), and it can freeze the database or the server.
- A search like `.*` matches everything, and characters like `(` throw errors.

**Fix:** The search must be a string, it is cut to 100 characters, and special regex characters are
escaped with `escapeRegex()` so the text is matched literally.

---

## 9. Small issue: wrong status code on create

**Problem:** POST returns `200 OK` after creating a note.

**Why it matters:** It isn't a security problem, but the HTTP standard says creating something should
return `201 Created`, and clients may rely on that.

**Fix:** `res.status(201)`.

---

## Notes about `after.js`

- It needs the `jsonwebtoken` package and a `JWT_SECRET` environment variable. The login route that
  creates tokens is outside this file.
- The token must contain the user's id in the `sub` field.
