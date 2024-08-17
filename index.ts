import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

// middlewares
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5dbzkti.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const users = client.db("tsc").collection("users");
    // await client.db("admin").command({ ping: 1 });

    app.post("/users", async (req, res) => {
      const isSocialLogin = req.query.socialLogin == "true";
      const defaultUser = req.body;
      const socialUser = { ...req.body, role: "student" };
      if (!isSocialLogin) {
        const result = await users.insertOne(defaultUser);
        res.send(result);
      } else {
        const result = await users.insertOne(socialUser);
        res.send(result);
      }
    });
    app.get("/students", (req, res) => {
      res.send("this are the students data sent from the route");
    });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

app.get("/", (req, res) => {
  res.send("Tsc server is running");
  // res.send(req.params);
});

app.get("/test", (req, res) => {
  res.send(req.query);
});
