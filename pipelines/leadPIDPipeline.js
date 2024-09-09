const leadPIDPipeline = (pid) => {

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
      $match: pid && pid === 'New' ? { 
        "createdOn": {
          "$gte": new Date(new Date().setMonth(new Date().getMonth() - 2))
        }
          } : pid && pid !== 'All' ? { 
          "productDetails.PID": pid 
      } : {}
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
          createdOn: 1,
          assignedTo: "$userDetails.uName"
        }
      }
    }
  ];

  return pipeline;
}

module.exports = leadPIDPipeline;


// const leadPIDPipeline = (pid) => {
  
//   const pipeline = [
//     // Lookup to join LeadProduct with Lead
//     {
//       $lookup: {
//         from: "Leads",
//         localField: "LID",
//         foreignField: "LID",
//         as: "leadDetails"
//       }
//     },
//     {
//       $unwind: "$leadDetails"
//     },
//     // Lookup to join LeadProduct with Products
//     {
//       $lookup: {
//         from: "Products",
//         localField: "PID",
//         foreignField: "PID",
//         as: "productDetails"
//       }
//     },
//     {
//       $unwind: "$productDetails"
//     },
//     // Lookup to join LeadProduct with Status
//     {
//       $lookup: {
//         from: "Status",
//         localField: "SID",
//         foreignField: "SID",
//         as: "statusDetails"
//       }
//     },
//     {
//       $unwind: "$statusDetails"
//     },
//     // Lookup to join LeadProduct with Users
//     {
//       $lookup: {
//         from: "Users",
//         localField: "UID",
//         foreignField: "UID",
//         as: "userDetails"
//       }
//     },
//     {
//       $unwind: "$userDetails"
//     },
//     // Optional match to filter by PID if provided
//     {
//       $match: pid && pid !== 'All' ? { "productDetails.PID": pid } : {}
//     },
//     // Projecting the required fields
//     {
//       $project: {
//         _id: 0,
//         LID: "$leadDetails.LID",
//         name: "$leadDetails.name",
//         designationDept: "$leadDetails.designationDept",
//         organizationName: "$leadDetails.organizationName",
//         contact: "$leadDetails.contact",
//         address: "$leadDetails.address",
//         productDetails: {
//           PID: "$productDetails.PID",
//           pName: "$productDetails.pName",
//           source: "$productDetails.source",
//           SID: "$statusDetails.SID",
//           sName: "$statusDetails.sName",
//           createdOn: 1,
//           assignedTo: "$userDetails.uName"
//         }
//       }
//     }
//   ];

//   return pipeline;
// }

// module.exports = leadPIDPipeline;
