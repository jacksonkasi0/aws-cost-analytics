const AWS = require('aws-sdk');
const costExplorer = new AWS.CostExplorer();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const cloudWatch = new AWS.CloudWatch();

exports.handler = async (event) => {
    try {
        // Get current date
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 30); // Get last 30 days of data
        
        // Format dates for Cost Explorer API
        const formattedStartDate = startDate.toISOString().split('T')[0];
        const formattedEndDate = today.toISOString().split('T')[0];
        
        console.log(`Fetching cost data from ${formattedStartDate} to ${formattedEndDate}`);
        
        // Get cost data from Cost Explorer
        const costData = await costExplorer.getCostAndUsage({
            TimePeriod: {
                Start: formattedStartDate,
                End: formattedEndDate
            },
            Granularity: "DAILY",
            Metrics: ["UnblendedCost"],
            GroupBy: [
                { Type: "DIMENSION", Key: "SERVICE" }
            ]
        }).promise();
        
        console.log(`Retrieved ${costData.ResultsByTime.length} days of cost data`);
        
        let dynamoDBRecords = 0;
        let cloudWatchMetrics = 0;
        
        // Process each day's data
        for (const day of costData.ResultsByTime) {
            const date = day.TimePeriod.Start;
            console.log(`\nProcessing data for date: ${date}`);
            
            // Process each service's cost
            for (const group of day.Groups) {
                const service = group.Keys[0];
                const cost = parseFloat(group.Metrics.UnblendedCost.Amount);
                const currency = group.Metrics.UnblendedCost.Unit;
                
                console.log(`Service: ${service}, Cost: ${cost} ${currency}`);
                
                // Store in DynamoDB with the exact date from Cost Explorer
                await dynamoDB.put({
                    TableName: process.env.COST_TABLE_NAME,
                    Item: {
                        date: date,  // Use the exact date from Cost Explorer
                        service: service,
                        cost: cost,
                        currency: currency
                    }
                }).promise();
                dynamoDBRecords++;
                
                // Only publish to CloudWatch if the date is within the last two weeks
                const dayDate = new Date(date);
                const twoWeeksAgo = new Date(today);
                twoWeeksAgo.setDate(today.getDate() - 14);
                
                if (dayDate >= twoWeeksAgo) {
                    const metricData = {
                        MetricName: 'ServiceCost',
                        Dimensions: [
                            {
                                Name: 'Service',
                                Value: service
                            },
                            {
                                Name: 'Currency',
                                Value: currency
                            }
                        ],
                        Timestamp: dayDate,
                        Value: cost,
                        Unit: 'Count'
                    };
                    
                    await cloudWatch.putMetricData({
                        Namespace: 'AWS/CostAnalytics',
                        MetricData: [metricData]
                    }).promise();
                    cloudWatchMetrics++;
                }
            }
        }
        
        console.log(`\nProcessing Summary:`);
        console.log(`Records stored in DynamoDB: ${dynamoDBRecords}`);
        console.log(`Metrics published to CloudWatch: ${cloudWatchMetrics}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Cost data collected and published successfully",
                summary: {
                    dynamoDBRecords,
                    cloudWatchMetrics,
                    dateRange: {
                        start: formattedStartDate,
                        end: formattedEndDate
                    }
                }
            })
        };
    } catch (error) {
        console.error('Error collecting cost data:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            requestId: error.requestId,
            statusCode: error.statusCode
        });
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Error collecting cost data',
                details: error.message
            })
        };
    }
};