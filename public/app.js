// const express = require('express');
// const mongoose = require('mongoose');
// const path = require('path');
// const bodyParser = require('body-parser');
// const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' folder

// Session/Cookie Setup
app.use(
  session({
    secret: "key", // Change this to a secure key
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 1 day expiration for the session
    },
  })
);

// MongoDB URI (adjust to your credentials)
const uri = 'mongodb+srv://timbrennanstl:MunyT48_summer@cluster0.ryqao.mongodb.net/bookstore?retryWrites=true&w=majority';

// Connect to MongoDB
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.log('Database connection error:', err));

// User Schema
const UserSchema = new mongoose.Schema({
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    inventory: { type: Number, required: true }, // Track stock levels
  });
  
  const Product = mongoose.model('Product', ProductSchema);


//   const Product = require('./models/Product'); // Make sure to import your Product model

app.post("/checkout", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Please log in to checkout" });
  }

  if (!req.session.cart || req.session.cart.length === 0) {
    return res.status(400).json({ message: "Your cart is empty" });
  }

  try {
    const cart = req.session.cart;

    for (let item of cart) {
      const product = await Product.findOne({ _id: item.itemId });

      if (!product) {
        return res.status(404).json({ message: `Item ${item.itemId} not found` });
      }

      if (product.inventory < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${product.name}` });
      }

      // Decrement the inventory
      product.inventory -= item.quantity;
      await product.save();
    }

    // Clear the cart after checkout
    req.session.cart = [];

    res.json({ message: "Checkout successful. Inventory updated!" });

  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Failed to process checkout" });
  }
});




// Registration Route
app.post('/api/register', async (req, res) => {
    const { fname, lname, username, password } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Create new user
        const newUser = new User({
            fname,
            lname,
            username,
            password,
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Login Route
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find the user by username
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Compare the entered password with the stored password (no hashing)
        if (password === user.password) {
            // Store user info in the session
            req.session.user = { id: user._id, username: user.username };
            res.json({ message: "Logged in successfully", user });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ error: "Failed to log in" });
    }
});

// Add to Cart Route
app.post("/add-to-cart", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Please log in first" });
    }

    const { itemId, quantity, price } = req.body.item; // Get item details from the request

    // Initialize the cart if it doesn't exist in the session
    req.session.cart = req.session.cart || [];

    // Check if the item already exists in the cart
    const existingItemIndex = req.session.cart.findIndex(item => item.itemId === itemId);

    if (existingItemIndex > -1) {
        // If the item exists, increase its quantity
        req.session.cart[existingItemIndex].quantity += quantity;
    } else {
        // If the item doesn't exist, add it to the cart
        req.session.cart.push({ itemId, quantity, price });
    }

    res.json({ message: "Item added to cart", cart: req.session.cart });
});

// Get Total Cost of Cart
app.get("/cart-total", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Please log in first" });
    }

    const cart = req.session.cart || [];

    // Calculate the total cost by summing up price * quantity for each item in the cart
    const totalCost = cart.reduce((total, item) => total + item.quantity * item.price, 0);

    res.json({ totalCost });
});

// Remove Item from Cart
app.post("/remove-from-cart", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Please log in first" });
    }

    const { itemId } = req.body;

    // Find and remove the item from the cart
    req.session.cart = req.session.cart.filter(item => item.itemId !== itemId);

    res.json({ message: "Item removed from cart", cart: req.session.cart });
});

// Clear the Cart
app.post("/clear-cart", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Please log in first" });
    }

    req.session.cart = []; // Clear the cart

    res.json({ message: "Cart cleared", cart: req.session.cart });
});

// Profile Route (to view user details)
app.get("/profile", (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ message: "Please log in first" });
    }
});

// Logout Route
app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "Error logging out" });
        }
        res.clearCookie("connect.sid"); // Clear the session cookie
        res.json({ message: "Logged out successfully" });
    });
});

// Route to get the user's cart
app.get("/cart", (req, res) => {
  if (req.session.cart) {
    res.json(req.session.cart); // Send the cart items
  } else {
    res.json([]); // No items in the cart
  }
});


app.post("/cart/remove/:itemId", (req, res) => {
  const itemId = req.params.itemId;
  const cart = req.session.cart;

  // Find the item in the cart
  const itemIndex = cart.findIndex((item) => item.itemId === itemId);

  if (itemIndex !== -1) {
    // Decrease quantity by 1
    if (cart[itemIndex].quantity > 1) {
      cart[itemIndex].quantity -= 1;
    } else {
      // Remove the item entirely if quantity is 1
      cart.splice(itemIndex, 1);
    }
    res.json({ message: "Item removed", cart });
  } else {
    res.status(404).json({ error: "Item not found" });
  }
});


app.put('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  const updatedData = req.body; // This will contain the updated price

  try {
      const updatedProduct = await Product.findByIdAndUpdate(productId, updatedData, { new: true });
      res.json(updatedProduct); // Send back the updated product
  } catch (error) {
      res.status(500).json({ message: 'Error updating product', error });
  }
});





// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
