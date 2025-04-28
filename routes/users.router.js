const express = require('express');
const usersModel = require('../models/users.model');
const router = express.Router();
const bcrypt = require('bcrypt'); 

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request received:', req.body);

  try {
    const user = await usersModel.getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid Email or Password.' });
    }

    // Compare the password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid Email or Password' });
    }

    const role = await usersModel.getRoleById(user.roleid);

    if (!role) {
      return res.status(404).json({ message: 'User role not found' });
    }

    // If everything is valid, respond with user info
    res.status(200).json({
      message: `Login successful and login as ${role.rolename}`,
      user: {
        email: user.email,
        username: user.username,
        role: role.rolename,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/',(req,res) =>{  //endpoint to get all users
    usersModel.getAllUsers()
    .then((users) => res.status(200).json(users))
    .catch((error) => {
        console.error('Error fetching users:', error); // shouw in terminal
        res.status(500).json({ message: 'Server error', error: error.message }); // show in browser
    });
})

router.post('/register', async (req, res) => {
  const { email, username, password, roleid } = req.body;
  console.log('Create user request received:', req.body);

  try {
      // Check if user already exists
      const existingUser = await usersModel.getUserByEmail(email);
      if (existingUser) {
          return res.status(400).json({ message: 'User already exists' });
      }else{
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password)) {
        return res.status(400).json({ message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' });
    }
      }
      
      const newUser = await usersModel.createUser(email, username, password, roleid);

      res.status(201).json({
          message: 'User created successfully',
          user: {
              email: newUser.email,
              username: newUser.username,
              roleid: newUser.roleid,
          }
      });

  } catch (error) {
      console.error('Create User Error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
  }
});


module.exports = router;
