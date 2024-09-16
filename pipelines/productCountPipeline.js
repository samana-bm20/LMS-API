const productLeadCountPipeline = (userType, uid) => {
    let pipeline = [
        {
            $group: {
                _id: { productId: "$PID", statusId: "$SID" },
                totalLeads: { $sum: 1 }
            }
        },

        {
            $lookup: {
                from: "Status",
                localField: "_id.statusId",
                foreignField: "SID",
                as: "statusDetails"
            }
        },

        {
            $unwind: "$statusDetails"
        },

        {
            $group: {
                _id: "$_id.productId",
                totalLeads: { $sum: "$totalLeads" },
                activeLeads: {
                    $sum: {
                        $cond: [
                            {
                                $in: ["$statusDetails.sName", ["active"]]
                            },
                            "$totalLeads",
                            0
                        ]
                    }
                },
                deadLeads: {
                    $sum: {
                        $cond: [
                            { $eq: ["$statusDetails.sName", "inactive"] },
                            "$totalLeads",
                            0
                        ]
                    }
                }
            }
        },

        {
            $lookup: {
                from: "Products",
                localField: "_id",
                foreignField: "PID",
                as: "productDetails"
            }
        },
        {
            $unwind: "$productDetails"
        },
        {
            $sort: {
                totalLeads: -1
            }
        },
        {
            $project: {
                _id: 0,
                productName: "$productDetails.pName",
                PID: "$productDetails.PID",
                totalLeads: 1,
                activeLeads: 1,
                deadLeads: 1
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

module.exports = productLeadCountPipeline