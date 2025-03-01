const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require("express-session");
const { MongoClient } = require("mongodb");

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



    app.get('/api/order-history', async (req, res) => {
      if (!req.session.user) {
        return res.status(401).json({ message: 'Please log in to view your order history' });
      }
    
      try {
        const user = await User.findOne({ username: req.session.user.username });
        
        // If the user is found, send the orderHistory array
        if (user && user.orderHistory) {
          res.json({ orders: user.orderHistory });
        } else {
          res.status(404).json({ message: 'No order history found for this user' });
        }
      } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).json({ message: 'Failed to fetch order history' });
      }
    });
   

// User Schema
const UserSchema = new mongoose.Schema({
  fname: { type: String, required: true },
  lname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  admin: {type: Boolean, required: true},
  orderHistory: { type: Array, default: [] }, // Add this line to store order history
});

const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    inventory: { type: Number, required: true }, // Track stock levels
  });
  
  const Product = mongoose.model('Product', ProductSchema);





  app.post("/checkout", async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Please log in to checkout" });
    }
  
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.status(400).json({ message: "Your cart is empty" });
    }
  
    try {
      const cart = req.session.cart;
      let totalCost = 0;
      let orderItems = [];
  
      for (let item of cart) {
        try {
          const productId = new mongoose.Types.ObjectId(item.itemId); // Convert to ObjectId
          const product = await Product.findOne({ _id: productId });
  
          if (!product) {
            return res.status(404).json({ message: `Item ${item.itemId} not found` });
          }
  
          if (product.inventory < item.quantity) {
            return res.status(400).json({ message: `Not enough stock for ${product.name}` });
          }
  
          // Calculate item total price
          const itemTotalPrice = product.price * item.quantity;
  
          // Add item to order history
          orderItems.push({
            name: product.name,
            unitPrice: product.price,
            quantity: item.quantity,
            totalPrice: itemTotalPrice
          });
  
          // Update total cost
          totalCost += itemTotalPrice;
  
          // Decrement inventory
          product.inventory -= item.quantity;
          await product.save();
        } catch (idError) {
          console.error(`Invalid ObjectId: ${item.itemId}`, idError);
          return res.status(400).json({ message: `Invalid product ID: ${item.itemId}` });
        }
      }
  
      // Store order history
      const user = await User.findOne({ username: req.session.user.username });
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      const order = {
        dateTime: new Date().toISOString(),
        items: orderItems,
        totalCost: totalCost
      };
  
      // Push the new order into the user's orderHistory array
      user.orderHistory.push(order);
      await user.save();
  
      // Clear cart after successful checkout
      req.session.cart = [];
  
      res.json({ message: "Checkout successful. Inventory updated!", order });
  
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Failed to process checkout", error: error.message });
    }
  });
  



// Registration Route
const SECRET_ADMIN_CODE = "1234"; // Replace with your actual secret code

app.post('/api/register', async (req, res) => {
    const { fname, lname, username, password, admin, secretCode } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Check if secret code is correct
        if (admin === "yes" && secretCode !== SECRET_ADMIN_CODE) {
          return res.status(400).json({ error: 'Code Incorrect, please try again' });
      }

        // Validate admin status based on secret code
        let isAdmin = false;
        if (admin === "yes" && secretCode === SECRET_ADMIN_CODE) {
            isAdmin = true; // Set isAdmin to true if code matches
        }

        // Create new user
        const newUser = new User({
            fname,
            lname,
            username,
            password,
            admin: isAdmin, // Store isAdmin value in the admin field
        });

        // Save the user to the database
        await newUser.save();

        // Respond with a success message
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

      // Compare the entered password with the stored password (assuming no hashing for now)
      if (password === user.password) {
          // Store user info in the session
          req.session.user = { id: user._id, username: user.username };

          // Send username to the frontend
          res.json({ success: true, username: user.username });
      } else {
          res.status(401).json({ error: "Invalid password" });
      }
  } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Failed to log in" });
  }
});

// Add to Cart Route
// Add to Cart Route
app.post("/add-to-cart", async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ message: "Please log in first" });
  }

  const { itemId, quantity } = req.body.item; // Get item details from the request

  // Initialize the cart if it doesn't exist in the session
  req.session.cart = req.session.cart || [];

  try {
      const product = await Product.findById(itemId); // Get product by ID

      if (!product) {
          return res.status(404).json({ message: "Product not found" });
      }

      // Check if adding the quantity exceeds the product's inventory
      const existingItemIndex = req.session.cart.findIndex(item => item.itemId === itemId);
      const currentQuantity = existingItemIndex > -1 ? req.session.cart[existingItemIndex].quantity : 0;
      const totalQuantity = currentQuantity + quantity;

      if (totalQuantity > product.inventory) {
          return res.status(400).json({ message: `Not enough stock for ${product.name}` });
      }

      // Check if the item already exists in the cart
      if (existingItemIndex > -1) {
          // If the item exists, increase its quantity
          req.session.cart[existingItemIndex].quantity += quantity;
      } else {
          // If the item doesn't exist, add it to the cart
          req.session.cart.push({
              itemId,
              quantity,
              price: product.price,
              name: product.name // Store product name in the cart
          });
      }

      res.json({ message: "Item added to cart", cart: req.session.cart });
  } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add item to cart" });
  }
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

app.post("/cart/add/:itemId", async (req, res) => {
  const itemId = req.params.itemId;
  const cart = req.session.cart || [];

  // Fetch the product from the database
  try {
    const product = await Product.findById(itemId); // Get product by ID

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Find the item in the cart
    const itemIndex = cart.findIndex((item) => item.itemId === itemId);

    if (itemIndex !== -1) {
      // Check if adding another item exceeds the available inventory
      const currentQuantity = cart[itemIndex].quantity;
      const totalQuantity = currentQuantity + 1;

      if (totalQuantity > product.inventory) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }

      // If sufficient stock, increase quantity
      cart[itemIndex].quantity += 1;
    } else {
      // Check if the initial quantity exceeds the available inventory
      if (1 > product.inventory) {
        return res.status(400).json({ error: `Not enough stock for ${product.name}` });
      }

      // If the item doesn't exist in the cart, add it with a quantity of 1
      cart.push({
        itemId,
        quantity: 1,
        price: product.price,
        name: product.name, // Store product name in the cart
      });
    }

    // Update the cart in session
    req.session.cart = cart;

    // Return only the updated cart (no message)
    res.json({ cart: req.session.cart });
  } catch (error) {
    console.error("Error adding item to cart:", error);
    res.status(500).json({ error: "Failed to add item to cart" });
  }
});



app.get("/api/product/:id", async (req, res) => {
  try {
    const productId = req.params.id;

    // Convert to ObjectId
    const objectId = new mongoose.Types.ObjectId(productId);

    // Find product by ID
    const product = await Product.findOne({ _id: objectId });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    console.log("API Response:", product); // Debugging log

    res.json({
      name: product.name,
      price: product.price,
      inventory: product.inventory, // Return stock count
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Failed to retrieve product data" });
  }
});




// Fetch Product details (GET) by ID
app.get("/api/products/:id", async (req, res) => {
  const productId = req.params.id;

  try {
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      name: product.name,
      price: product.price,
      inventory: product.inventory,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Failed to retrieve product data" });
  }
});

app.get("/api/users/:username", async (req, res) => {
  const { username } = req.params;

  try {
      const user = await User.findOne({ username }).select("-password"); // Exclude password

      if (!user) {
          return res.status(404).json({ error: "User not found" });
      }

      // Rename fields to match what the frontend expects
      res.json({
          firstName: user.fname, 
          lastName: user.lname, 
          username: user.username,
          admin: user.admin
      });

  } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ error: "Failed to retrieve user data" });
  }
});

// Update Product (PATCH - Name, Price, Inventory)
app.patch("/api/products/:id", async (req, res) => {
  const productId = req.params.id;
  const { name, price, inventory } = req.body; // Extract name, price, and inventory from request body

  try {
    // Find and update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { 
        ...(name && { name }),  // Only update if name is provided
        ...(price !== undefined && { price }), 
        ...(inventory !== undefined && { inventory }) 
      },
      { new: true, runValidators: true } // Return the updated document and ensure validation
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product updated successfully", product: updatedProduct });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Failed to update product" });
  }
});



// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
