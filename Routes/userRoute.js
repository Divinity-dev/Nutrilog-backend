import User from "../models/user.js"
import express from "express"
import CryptoJS from "crypto-js"

const Route = express.Router()

//Create
Route.post('/create', async (req, res)=>{
    const user = new User(
        {
          userName:req.body.userName,
          email:req.body.email,
          password:CryptoJS.AES.encrypt(req.body.password, process.env.crypto_key).toString()
        }
    )
    try {
        const savedUser = await user.save()
        res.status(201).json(savedUser)
    } catch (error) {
        res.status(401).json(error)
    }
})

//login
Route.post("/login", async (res,req)=>{
    try {
        const validator = await User.findOne({email:req.body.email} || {userName:req.body.userName})
        
      if (!validator) {
        return res.status(401).json("User not found");
      }
  
      const hashedPassword = CryptoJS.AES.decrypt(validator.password, process.env.crypto_key).toString(CryptoJS.enc.Utf8);
  
      if (hashedPassword !== req.body.password) {
        console.log("Wrong password entered. Decrypted:", hashedPassword, "| Provided:", req.body.password);
        return res.status(401).json("Wrong password");
      }
      const { password, ...others } = validator._doc;
      res.status(201).json(others)
    } catch (error) {
        res.status(401).json(error)
    }
} )