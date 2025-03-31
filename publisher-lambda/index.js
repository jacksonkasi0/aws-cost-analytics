const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const cloudWatch = new AWS.CloudWatch();

exports.handler = async (event) => {
    try {
        // Get current date for reference
        const today = new Date();
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 14); // Only get last 14 days of data
        
        // Format date for DynamoDB queries
        const formattedTwoWeeksAgo = twoWeeksAgo.toISOString().split('T')[0];
        
        console.log(`CloudWatch only accepts metrics from ${formattedTwoWeeksAgo} onwards`);
        console.log(`Current time: ${today.toISOString()}`);
        
        // Query DynamoDB for all data in the last 14 days
        console.log(`Querying DynamoDB for data since ${formattedTwoWeeksAgo}`);
        
        // We'll use a scan with a filter expression
        const scanParams = {
            TableName: process.env.COST_TABLE_NAME,
            FilterExpression: "#date >= :startDate",
            ExpressionAttributeNames: {
                "#date": "date"
            },
            ExpressionAttributeValues: {
                ":startDate": formattedTwoWeeksAgo
            }
        };
        
        const result = await dynamoDB.scan(scanParams).promise();
        console.log(`Found ${result.Items.length} records within the last 14 days`);
        
        // Group items by service for better visualization
        const serviceMap = {};
        
        for (const item of result.Items) {
            // Skip very small costs to avoid clutter
            if (item.cost < 0.0001) continue;
            
            // Create a key that combines service and date
            const service = item.service;
            if (!serviceMap[service]) {
                serviceMap[service] = [];
            }
            
            // Only include dates within the allowed CloudWatch range
            const itemDate = new Date(item.date);
            if (itemDate >= twoWeeksAgo && itemDate <= today) {
                serviceMap[service].push(item);
            }
        }
        
        let totalMetricsPublished = 0;
        
        // Publish metrics for each service
        for (const service in serviceMap) {
            const items = serviceMap[service];
            console.log(`Processing ${items.length} data points for service: ${service}`);
            
            // Prepare metrics
            const metricData = [];
            
            for (const item of items) {
                // Ensure the timestamp is within the allowed range
                const timestamp = new Date(item.date);
                
                // Double check the timestamp is valid
                if (timestamp < twoWeeksAgo || timestamp > today) {
                    console.log(`Skipping record with date ${item.date} - outside allowed range`);
                    continue;
                }
                
                console.log(`Publishing metric for ${service} on ${item.date}, Cost: ${item.cost} ${item.currency}`);
                
                metricData.push({
                    MetricName: 'ServiceCost',
                    Dimensions: [
                        {
                            Name: 'Service',
                            Value: service
                        },
                        {
                            Name: 'Currency',
                            Value: item.currency
                        }
                    ],
                    Timestamp: timestamp,
                    Value: item.cost,
                    Unit: 'Count'
                });
                
                // CloudWatch allows max 20 metrics per request
                if (metricData.length === 20) {
                    await publishMetrics(metricData);
                    totalMetricsPublished += metricData.length;
                    metricData.length = 0;
                }
            }
            
            // Publish remaining metrics
            if (metricData.length > 0) {
                await publishMetrics(metricData);
                totalMetricsPublished += metricData.length;
            }
        }
        
        console.log(`\nProcessing Summary:`);
        console.log(`Total metrics published: ${totalMetricsPublished}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Metrics published successfully',
                summary: {
                    totalMetricsPublished,
                    dateRange: {
                        start: formattedTwoWeeksAgo,
                        end: today.toISOString().split('T')[0]
                    }
                }
            })
        };
    } catch (error) {
        console.error('Error publishing metrics:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            requestId: error.requestId,
            statusCode: error.statusCode
        });
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Error publishing metrics',
                details: error.message
            })
        };
    }
};

async function publishMetrics(metricData) {
    const params = {
        Namespace: 'AWS/CostAnalytics',
        MetricData: metricData
    };
    
    try {
        await cloudWatch.putMetricData(params).promise();
        console.log(`Published ${metricData.length} metrics`);
    } catch (error) {
        console.error(`Error publishing metrics: ${error.message}`);
        throw error;
    }
}