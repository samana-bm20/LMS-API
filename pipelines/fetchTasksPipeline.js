const fetchTasksPipeline = [
    {
      $lookup: {
        from: 'Users', 
        localField: 'UID', 
        foreignField: 'UID', 
        as: 'userDetails' 
      }
    },
    {
      $unwind: {
        path: '$userDetails', 
        preserveNullAndEmptyArrays: true 
      }
    },
    {
      $lookup: {
        from: 'Products', 
        localField: 'PID', 
        foreignField: 'PID', 
        as: 'productDetails' 
      }
    },
    {
      $unwind: {
        path: '$productDetails', 
        preserveNullAndEmptyArrays: true 
      }
    },
    {
      $lookup: {
        from: 'Leads', 
        localField: 'LID', 
        foreignField: 'LID', 
        as: 'leadDetails' 
      }
    },
    {
      $unwind: {
        path: '$leadDetails', 
        preserveNullAndEmptyArrays: true 
      }
    },
    {
      $addFields: {
        uName: '$userDetails.uName',
        pName: '$productDetails.pName',
        lName: '$leadDetails.name', 
        organization: '$leadDetails.organizationName', 
      }
    },
    {
      $project: {
        _id: 0,
        userDetails: 0,
        productDetails: 0,
        leadDetails: 0,
      }
    },
    {
        $sort: {
          taskDate: -1 
        }
      }
  ];

module.exports = fetchTasksPipeline;
  
  