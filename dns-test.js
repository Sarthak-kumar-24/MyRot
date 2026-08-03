const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();

const mongoose = require("mongoose");

console.log(process.env.MONGO_URI); // temporarily check it's loaded

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected"))
  .catch(console.error);
