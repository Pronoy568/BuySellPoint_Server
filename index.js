const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DBUSER}:${process.env.DBPASS}@cluster0.vqc0wwo.mongodb.net/${process.env.DBUSER}?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
});

async function run() {
  try {
    // Connect to MongoDB
    client.connect((err) => {
      if (err) {
        console.log(err);
        return;
      }
    });
    // Collect Database Collection
    const db = client.db("BuySellPointDB");
    const UserCollection = db.collection("users");
    const ProductCollection = db.collection("product");
    const SelectProductCollection = db.collection("selectProduct");
    const PaymentCollection = db.collection("payment");

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    // payment related api
    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await PaymentCollection.find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      if (!payment.email || !payment.transactionId || !payment.price) {
        return res.status(400).send({ error: "Required fields missing" });
      }

      const query = {
        _id: {
          $in: payment.cartItems.map((id) => new ObjectId(id)),
        },
      };

      const insertResult = await PaymentCollection.insertOne(payment);
      const deleteResult = await SelectProductCollection.deleteMany(query);
      res.send({ result: insertResult, deleteResult });
    });

    // jwt related apis
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Product related apis
    app.get("/product", async (req, res) => {
      const result = await ProductCollection.find().toArray();
      res.send(result);
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const product = await ProductCollection.findOne(query);
      res.send(product);
    });

    app.post("/product", async (req, res) => {
      const newProduct = req.body;
      const result = await ProductCollection.insertOne(newProduct);
      res.send(result);
    });

    app.patch("/product/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedProduct,
      };
      const result = await ProductCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ProductCollection.deleteOne(query);
      res.send(result);
    });

    // user related apis
    app.get("/users", async (req, res) => {
      const result = await UserCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await UserCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await UserCollection.insertOne(user);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await UserCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await UserCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await UserCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/seller/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "seller",
        },
      };
      const result = await UserCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/users/seller/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await UserCollection.findOne(query);
      const result = { seller: user?.role === "seller" };
      res.send(result);
    });

    app.get("/users/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.send({ user: false });
      }
      const query = { email: email };
      const user = await UserCollection.findOne(query);
      const result = { user: user?.role === "user" };
      res.send(result);
    });

    //Selected Product related apis
    app.get("/selectedProduct", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }

      const query = { email: email };
      const result = await SelectProductCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/selectedProduct", async (req, res) => {
      const item = req.body;
      const result = await SelectProductCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/selectedProduct/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await SelectProductCollection.deleteOne(query);
      res.send(result);
    });

    // route
    app.get("/", (req, res) => {
      const serverStatus = {
        message: "BuySellPoint Server is running smoothly",
        timestamp: new Date(),
      };
      res.json(serverStatus);
    });

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } finally {
  }
}

run().catch(console.dir);
