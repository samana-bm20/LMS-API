const leadPIDPipeline = (userType, uid, pid) => {

  const pipeline = [
    {
      $lookup: {
        from: "Leads",
        localField: "LID",
        foreignField: "LID",
        as: "leadDetails"
      }
    },
    {
      $unwind: "$leadDetails"
    },
    {
      $lookup: {
        from: "Products",
        localField: "PID",
        foreignField: "PID",
        as: "productDetails"
      }
    },
    {
      $unwind: "$productDetails"
    },
    {
      $lookup: {
        from: "Status",
        localField: "SID",
        foreignField: "SID",
        as: "statusDetails"
      }
    },
    {
      $unwind: "$statusDetails"
    },
    {
      $lookup: {
        from: "Users",
        localField: "UID",
        foreignField: "UID",
        as: "userDetails"
      }
    },
    {
      $unwind: "$userDetails"
    },
    {
      $match:
        pid && pid === "New"
          ? {
              "createdOn": {
                "$gte": new Date(new Date().setMonth(new Date().getMonth() - 2))
              }
            }
          : pid && pid !== "All"
          ? {
              "productDetails.PID": pid
            }
          : {}
    },
    {
      $addFields: {
        sortPriority: {
          $cond: {
            if: { $eq: ["$statusDetails.sName", "inactive"] },
            then: 1,
            else: 0
          }
        }
      }
    },
    {
      $sort: {
        sortPriority: 1,
        createdOn: -1 
      }
    },
    {
      $project: {
        _id: 0,
        LID: "$leadDetails.LID",
        name: "$leadDetails.name",
        designationDept: "$leadDetails.designationDept",
        organizationName: "$leadDetails.organizationName",
        contact: "$leadDetails.contact",
        address: "$leadDetails.address",
        productDetails: {
          PID: "$productDetails.PID",
          pName: "$productDetails.pName",
          source: "$productDetails.source",
          SID: "$statusDetails.SID",
          sName: "$statusDetails.sName",
          createdOn: "$createdOn",
          assignedTo: "$userDetails.uName"
        }
      }
    }
  ];

  if (userType === 2) {
    pipeline.unshift({
      $match: {
        UID: uid
      }
    });
  }

  return pipeline;
};

module.exports = leadPIDPipeline;
