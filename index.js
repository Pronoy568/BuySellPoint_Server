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
      const query = {
        _id: new ObjectId(payment.selectedPayment._id.toString()),
      };
      const updateQuery = {
        _id: new ObjectId(payment.selectedPayment.ProductItemId.toString()),
      };
      const updateSeat = await ProductCollection.updateOne(updateQuery, {
        $inc: { available: -1 },
      });

      const insertResult = await PaymentCollection.insertOne(payment);
      const deleteResult = await SelectProductCollection.deleteOne(query);
      res.send({ result: insertResult, deleteResult, updateSeat });
    });

    // jwt related apis
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
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
