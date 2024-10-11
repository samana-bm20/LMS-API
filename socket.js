const jwt = require('jsonwebtoken');
const { client } = require('./config/database');
const collection = client.db().collection('Leads');
const nCollection = client.db().collection('Notifications');
const uCollection = client.db().collection('Users');
const lpCollection = client.db().collection('LeadProducts');
const pCollection = client.db().collection('Products');
const tCollection = client.db().collection('Tasks');

let connectedUsers = {}; // Store connected users

const socketHandler = (io, SECRET_KEY) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) {
        return next(new Error('Authentication error'));
      }
      socket.decoded = decoded;
      next();
    });
  });

  let allUsers = [];

  const refreshAllUsers = async () => {
    try {
      allUsers = await uCollection.find({}).toArray();
      // console.log("User list refreshed");
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // setInterval(refreshAllUsers, 5 * 60 * 1000);
  refreshAllUsers();

  io.on('connection', (socket) => {
    const uid = socket.decoded.uid;
    const userType = socket.decoded.userType;
    connectedUsers[uid] = socket.id;

    //#region addLead
    socket.on("addLead", async (addLeadData) => {

      try {
        const notificationData = {
          time: new Date(),
          sentBy: uid,
          keyword: addLeadData.name,
          redirect: 'leads',
        };

        if (userType === 1) {
          if (uid !== addLeadData.UID) {
            notificationData.eventType = 'newLead';
            notificationData.targetUsers = [{ uid: addLeadData.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[addLeadData.UID]) {
              io.to(connectedUsers[addLeadData.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          notificationData.eventType = 'newLeadUser';
          notificationData.targetUsers = allUsers
            .filter(user => user.userType === 1)
            .map(user => ({ uid: user.UID, hasRead: false }));

          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }
      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region addFollowup
    socket.on("addFollowup", async (followUpData) => {
      const lead = await lpCollection.findOne({ LID: followUpData.LID, PID: followUpData.PID });

      try {
        const notificationData = {
          eventType: (followUpData.nextDate || followUpData.nextType) ? 'nextFollowup' : 'newFollowup',
          time: new Date(),
          sentBy: uid,
          keyword: `${followUpData.LID}-${followUpData.PID}`,
          redirect: 'leads',
        };

        if (userType === 1) {
          if (uid !== lead.UID) {
            notificationData.targetUsers = [{ uid: lead.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[lead.UID]) {
              io.to(connectedUsers[lead.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          notificationData.targetUsers = allUsers
            .filter(user => user.userType === 1)
            .map(user => ({ uid: user.UID, hasRead: false }));

          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region leadProduct
    socket.on("leadProduct", async (productData) => {
      const products = await pCollection.find({}).toArray();
      const productName = (products.find(product => product.PID === productData.PID)).pName;

      try {
        const notificationData = {
          time: new Date(),
          sentBy: uid,
          keyword: `${productData.LID}-${productName}`,
          redirect: 'leads',
        };

        if (userType === 1) {
          if (uid !== productData.UID) {
            notificationData.eventType = 'leadProduct';
            notificationData.targetUsers = [{ uid: productData.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[productData.UID]) {
              io.to(connectedUsers[productData.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          const targetUsers = allUsers
            .filter(user => user.userType === 1)
            .map(user => ({ uid: user.UID, hasRead: false }));

          if (uid === productData.UID) {
            notificationData.eventType = 'leadProductSelf'
            notificationData.targetUsers = targetUsers;
          } else {
            const pUserType = (allUsers.find(user => user.UID === productData.UID)).userType;
            if (pUserType === 1) {
              notificationData.eventType = 'leadProduct'
              notificationData.targetUsers = targetUsers;
            } else {
              notificationData.eventType = 'leadProduct'
              notificationData.targetUsers = [{ uid: productData.UID, hasRead: false }];

              const notificationAdmin = {
                eventType: 'leadProductUser',
                time: new Date(),
                sentBy: uid,
                keyword: `${productData.LID}-${productName}`,
                redirect: 'leads',
                targetUsers: targetUsers
              };

              await nCollection.insertOne(notificationAdmin);
              notificationAdmin.targetUsers.forEach(target => {
                if (connectedUsers[target.uid]) {
                  io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
                }
              });
            }
          }

          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region editLead
    socket.on("editLead", async (editLeadData, lid) => {
      const leadProducts = await lpCollection.find({ LID: lid }).toArray();

      try {
        // Set up the notification data
        const notificationData = {
          eventType: 'editLead',
          time: new Date(),
          sentBy: uid,
          keyword: editLeadData.name,
          redirect: 'leads',
        };

        // Find all unique users assigned to the products for this lead
        const assignedUsers = leadProducts
          .map(product => product.UID)  // Assuming "assignedTo" is the user ID field
          .filter((value, index, self) => self.indexOf(value) === index);  // Remove duplicates

        if (userType === 1) {
          notificationData.targetUsers = assignedUsers
            .filter(userId => userId !== uid)  // Exclude admin himself (admin's `uid`)
            .map(userId => ({ uid: userId, hasRead: false }));

        } else {
          const admin = await uCollection.findOne({ userType: 1 });

          notificationData.targetUsers = assignedUsers
            .filter(userId => userId !== uid)  // Exclude the sender (user's `uid`)
            .map(userId => ({ uid: userId, hasRead: false }));

          // Add the admin if not already in the target list
          if (admin && admin.UID !== uid) {
            notificationData.targetUsers.push({ uid: admin.UID, hasRead: false });
          }
        }

        await nCollection.insertOne(notificationData);

        notificationData.targetUsers.forEach(target => {
          if (connectedUsers[target.uid]) {
            io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
          }
        });

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region addTask
    socket.on("addTask", async (taskData) => {

      try {
        const notificationData = {
          time: new Date(),
          sentBy: uid,
          keyword: taskData.title,
          redirect: 'tasks',
        };

        if (userType === 1) {
          if (uid !== taskData.UID) {
            notificationData.eventType = 'newTask';
            notificationData.targetUsers = [{ uid: taskData.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[taskData.UID]) {
              io.to(connectedUsers[taskData.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          notificationData.eventType = 'newTaskUser';
          notificationData.targetUsers = allUsers
            .filter(user => user.userType === 1)
            .map(user => ({ uid: user.UID, hasRead: false }));

          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }
      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region editTask
    socket.on("editTask", async (editTaskData, tid) => {
      const task = await tCollection.findOne({ TID: tid });

      try {
        const notificationData = {
          eventType: 'editTask',
          time: new Date(),
          sentBy: uid,
          keyword: task.title,
          redirect: 'tasks',
        };

        if (userType === 1) {
          if (uid !== editTaskData.UID) {
            notificationData.targetUsers = [{ uid: editTaskData.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[editTaskData.UID]) {
              io.to(connectedUsers[editTaskData.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          notificationData.targetUsers = allUsers
            .filter(user => user.userType === 1)
            .map(user => ({ uid: user.UID, hasRead: false }));

          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }
      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region editFollowup
    socket.on("editFollowup", async (editFollowUpData, selectedFollowUp) => {
      const products = await pCollection.find({}).toArray();
      const productName = (products.find(product => product.PID === selectedFollowUp.PID)).pName;

      try {
        const notificationData = {
          time: new Date(),
          sentBy: uid,
          keyword: `${selectedFollowUp.LID}-${productName}`,
          redirect: 'reminder',
        };

        if (userType === 1) {
          if (uid !== editFollowUpData.UID) {
            notificationData.eventType = 'editFollowup';
            notificationData.targetUsers = [{ uid: editFollowUpData.UID, hasRead: false }];

            await nCollection.insertOne(notificationData);

            if (connectedUsers[editFollowUpData.UID]) {
              io.to(connectedUsers[editFollowUpData.UID]).emit("receiveNotification", notificationData);
            }
          }
        } else {
          // Case when the sender is not an admin
          if (uid !== editFollowUpData.UID) {
            const followUpUser = allUsers.find(user => user.UID === editFollowUpData.UID);

            if (followUpUser.userType !== 1) {
              // Case when follow-up user is not an admin
              notificationData.eventType = 'assignFollowup';
              notificationData.targetUsers = [{ uid: editFollowUpData.UID, hasRead: false }];

              // Send a separate notification to admins with eventType 'editFollowup'
              const adminNotification = {
                eventType: 'adminFollowup',
                time: new Date(),
                sentBy: uid,
                keyword: `${selectedFollowUp.LID}-${productName}`,
                redirect: 'tasks',
                targetUsers: allUsers
                  .filter(user => user.userType === 1)
                  .map(user => ({ uid: user.UID, hasRead: false })),
              };

              await nCollection.insertOne(adminNotification);

              // Emit the admin notification to all connected admins
              adminNotification.targetUsers.forEach(target => {
                if (connectedUsers[target.uid]) {
                  io.to(connectedUsers[target.uid]).emit("receiveNotification", adminNotification);
                }
              });

            } else {
              // Case when follow-up user is admin
              notificationData.eventType = 'assignFollowup';
              notificationData.targetUsers = allUsers
                .filter(user => user.userType === 1)
                .map(user => ({ uid: user.UID, hasRead: false }));
            }

          } else {
            // Case when the sender is the follow-up user
            notificationData.eventType = 'editFollowup';
            notificationData.targetUsers = allUsers
              .filter(user => user.userType === 1)
              .map(user => ({ uid: user.UID, hasRead: false }));
          }

          // Insert and emit the notification to the target users
          await nCollection.insertOne(notificationData);

          notificationData.targetUsers.forEach(target => {
            if (connectedUsers[target.uid]) {
              io.to(connectedUsers[target.uid]).emit("receiveNotification", notificationData);
            }
          });
        }

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region newProduct
    socket.on("newProduct", async (addProductData) => {

      try {
        const targetUsers = allUsers
          .filter(user => user.UID !== uid)
          .map(user => ({ uid: user.UID, hasRead: false }));

        const notificationData = {
          eventType: 'newProduct',
          time: new Date(),
          sentBy: uid,
          keyword: addProductData.pName,
          redirect: 'products',
          targetUsers: targetUsers
        };

        await nCollection.insertOne(notificationData);

        targetUsers.forEach(target => {
          if (connectedUsers[target.uid]) {
            io.to(connectedUsers[target.uid]).emit("receiveNotification");
          }
        });

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region editProduct
    socket.on("editProduct", async (editProductData, pid) => {

      try {
        const targetUsers = allUsers
          .filter(user => user.UID !== uid)
          .map(user => ({ uid: user.UID, hasRead: false }));

        const notificationData = {
          eventType: 'editProduct',
          time: new Date(),
          sentBy: uid,
          keyword: `${pid}-${editProductData.pName}`,
          redirect: 'products',
          targetUsers: targetUsers
        };

        await nCollection.insertOne(notificationData);

        targetUsers.forEach(target => {
          if (connectedUsers[target.uid]) {
            io.to(connectedUsers[target.uid]).emit("receiveNotification");
          }
        });

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region newUser
    socket.on("newUser", async (addUserData) => {
      refreshAllUsers();

      try {
        const targetUsers = allUsers
          .filter(user => user.UID !== uid && user.uName !== addUserData.uName)
          .map(user => ({ uid: user.UID, hasRead: false }));

        const notificationData = {
          eventType: 'newUser',
          time: new Date(),
          sentBy: uid,
          keyword: addUserData.uName,
          redirect: 'users',
          targetUsers: targetUsers
        };

        await nCollection.insertOne(notificationData);

        targetUsers.forEach(target => {
          if (connectedUsers[target.uid]) {
            io.to(connectedUsers[target.uid]).emit("receiveNotification");
          }
        });

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    //#region editUser
    socket.on("editUser", async (editUserData, UID) => {
      refreshAllUsers();

      try {
        const targetUsers = allUsers
          .filter(user => user.UID !== uid && user.UID !== UID)
          .map(user => ({ uid: user.UID, hasRead: false }));

        const notificationData = {
          eventType: 'editUser',
          time: new Date(),
          sentBy: uid,
          keyword: `${UID}-${editUserData.uName}`,
          redirect: 'users',
          targetUsers: targetUsers
        };

        await nCollection.insertOne(notificationData);

        targetUsers.forEach(target => {
          if (connectedUsers[target.uid]) {
            io.to(connectedUsers[target.uid]).emit("receiveNotification");
          }
        });

      } catch (error) {
        console.error("Error saving notification:", error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      delete connectedUsers[uid];
    });
  });
};

module.exports = socketHandler;
