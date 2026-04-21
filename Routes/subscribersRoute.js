import express from "express";
import Subscriber from "../models/subscribers.js";


const Route = express.Router();

Route.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!email || !emailRegex.test(email)) {
  return res.status(400).json("Valid email is required");
}

    const existing = await Subscriber.findOne({ email });

    if (existing) {
      return res.status(200).json("Already subscribed");
    }

    const newSub = new Subscriber({ email });
    await newSub.save();

    res.status(201).json("Subscribed successfully");
  } catch (error) {
    res.status(500).json(error);
  }
});

Route.get("/subscribers", async (req,res)=>{
  try {
    const subs = await Subscriber.find()
    res.status(200).json(subs)
  } catch (error) {
    res.status(400).json(error)
  }
})


export default Route;