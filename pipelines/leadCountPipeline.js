// Function to generate pipeline
const LeadCountPipeline = (userType, uid) => {
    let pipeline = [
      {
        "$lookup": {
          "from": "Leads",
          "localField": "LID",
          "foreignField": "LID",
          "as": "leadDetails"
        }
      },
      {
        "$unwind": "$leadDetails"
      },
      {
        "$lookup": {
          "from": "Status",
          "localField": "SID",
          "foreignField": "SID",
          "as": "statusDetails"
        }
      },
      {
        "$unwind": "$statusDetails"
      },
      {
        "$facet": {
          "totalLeads": [
            {
              "$count": "count"
            }
          ],
          "statusCategorization": [
            {
              "$group": {
                "_id": "$statusDetails.sName", 
                "totalLeads": { "$sum": 1 }
              }
            },
            {
              "$project": {
                "_id": 0,
                "status": "$_id",
                "totalLeads": 1
              }
            }
          ],
          "newLeads": [
            {
              "$match": {
                "createdOn": {
                  "$gte": new Date(new Date().setMonth(new Date().getMonth() - 2))
                }
              }
            },
            {
              "$count": "count"
            }
          ]
        }
      },
      {
        "$project": {
          "totalLeads": { "$arrayElemAt": ["$totalLeads.count", 0] },
          "activeLeads": {
            "$arrayElemAt": [
              {
                "$filter": {
                  "input": "$statusCategorization",
                  "as": "status",
                  "cond": { "$eq": ["$$status.status", "active"] }
                }
              },
              0
            ]
          },
          "deadLeads": {
            "$arrayElemAt": [
              {
                "$filter": {
                  "input": "$statusCategorization",
                  "as": "status",
                  "cond": { "$eq": ["$$status.status", "inactive"] }  
                }
              },
              0
            ]
          },
          "newLeads": { "$arrayElemAt": ["$newLeads.count", 0] }
        }
      },
      {
        "$addFields": {
          "activeLeads": { "$ifNull": ["$activeLeads.totalLeads", 0] },
          "deadLeads": { "$ifNull": ["$deadLeads.totalLeads", 0] },
          "newLeads": { "$ifNull": ["$newLeads", 0] }
        }
      }
    ];
  
    if (userType === 2) {
      pipeline.unshift({
        "$match": {
          "UID": uid
        }
      });
    }
  
    return pipeline;
  };
  
  module.exports = LeadCountPipeline;
  