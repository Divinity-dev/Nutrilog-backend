import User from "../models/user.js";
import express from "express";
import CryptoJS from "crypto-js";

const Route = express.Router();

// CREATE USER
Route.post("/register", async (req, res) => {
  try {
    const user = new User({
      userName: req.body.userName,
      email: req.body.email,
      password: CryptoJS.AES.encrypt(
        req.body.password,
        process.env.crypto_key
      ).toString(),
    });

    const savedUser = await user.save();

    const { password, ...others } = savedUser._doc;
    res.status(201).json(others); 
  } catch (error) {
    res.status(500).json(error); 
  }
});

// LOGIN
Route.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [
        { email: req.body.email },
        { userName: req.body.userName },
      ],
    });

    if (!user) {
      return res.status(404).json("User not found");
    }

    const decryptedPassword = CryptoJS.AES.decrypt(
      user.password,
      process.env.crypto_key
    ).toString(CryptoJS.enc.Utf8);

    if (decryptedPassword !== req.body.password) {
      return res.status(401).json("Wrong password"); 
    }

    const { password, ...others } = user._doc;

    res.status(200).json(others); 
  } catch (error) {
    res.status(500).json(error); 
  }
});

export default Route;