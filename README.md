# Expense Tracker

A small full-stack app for tracking personal expenses. Users register and log in, then add, edit and
delete their own expenses and see monthly totals per category.

- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT authentication, bcrypt password hashing
- **Frontend:** plain HTML, CSS and JavaScript, served from the `public` folder

## Requirements

- **Node.js 22 or newer** (developed with Node 24)
- A **MongoDB Atlas** cluster (the free tier is enough) and its connection string

## Installation

```bash
npm install
```

Then copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

## Environment variables

| Name | Required | Example (placeholder) | Description |
|---|---|---|---|
| `MONGO_URI` | yes | `mongodb+srv://<username>:<password>@<cluster-host>/expensedb` | Connection string of the app's database |
| `JWT_SECRET` | yes | `replace-me-with-a-long-random-string` | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | no (default `1d`) | `1d` | How long a login token is valid |
| `MONGO_URI_TEST` | no | `mongodb+srv://<username>:<password>@<cluster-host>/expensedb_test` | Database for the tests. If missing, the tests use `MONGO_URI` with the database name changed to `expensedb_test` |

Never commit `.env`. It is already listed in `.gitignore`.

## Running the app

```bash
npm start
```

Then open <http://localhost:3000>.

## Running the tests

```bash
npm test
```

The tests use Node's built-in test runner (`node:test`) and [Supertest](https://github.com/ladjs/supertest).
They **never use the real database**:

- They connect to `MONGO_URI_TEST`, or to `MONGO_URI` with the database name changed to `expensedb_test`.
- They refuse to run if the database name doesn't end in `_test`.
- They delete every user and expense they created when they finish.

## Project structure

```
app.js            Express app: middleware, routes, error handler (exported, no listen)
server.js         Connects to MongoDB and starts the server
routes/           auth.js (register/login), expenses.js (expense API)
models/           User.js, Expense.js (Mongoose schemas and validation)
middleware/       auth (JWT check), error handler, helpers
public/           Frontend (HTML, CSS, JS)
test/             Automated tests
```

## API endpoints

| Method | URL | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create an account (`email`, `password`) |
| POST | `/api/auth/login` | no | Log in, returns a JWT `token` |
| GET | `/api/expenses` | yes | List my expenses (newest first) |
| GET | `/api/expenses/summary?month=YYYY-MM` | yes | Totals per category for one month |
| GET | `/api/expenses/:id` | yes | Get one of my expenses |
| POST | `/api/expenses` | yes | Create an expense (`title`, `amount`, `category`, `date`) |
| PUT | `/api/expenses/:id` | yes | Update one of my expenses |
| DELETE | `/api/expenses/:id` | yes | Delete one of my expenses |

Protected routes need the header `Authorization: Bearer <token>`.
Allowed categories: `Food`, `Transport`, `Bills`, `Other`.
