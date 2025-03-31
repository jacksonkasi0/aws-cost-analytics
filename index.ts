import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as grafana from "@pulumiverse/grafana";

// Configuration
const config = new pulumi.Config();
const grafanaUrl = config.require("grafanaUrl");
const grafanaApiKey = process.env.GRAFANA_API_KEY || config.requireSecret("grafanaApiKey");

// Create a DynamoDB table to store cost data
const costDataTable = new aws.dynamodb.Table("aws-cost-data", {
    attributes: [
        { name: "date", type: "S" },
        { name: "service", type: "S" },
    ],
    hashKey: "date",
    rangeKey: "service",
    billingMode: "PAY_PER_REQUEST",
});

// Create an IAM role for the Lambda function
const lambdaRole = new aws.iam.Role("cost-collector-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }],
    }),
});

// Attach policies to the Lambda role
const costExplorerPolicy = new aws.iam.Policy("cost-explorer-policy", {
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "ce:GetCostAndUsage",
                "ce:GetCostForecast",
                "ce:GetDimensionValues",
            ],
            Resource: "*",
        }],
    }),
});

new aws.iam.RolePolicyAttachment("cost-explorer-attachment", {
    role: lambdaRole.name,
    policyArn: costExplorerPolicy.arn,
});

new aws.iam.RolePolicyAttachment("lambda-basic-execution", {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

new aws.iam.RolePolicyAttachment("dynamodb-access", {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonDynamoDBFullAccess,
});

// Create the Lambda function to collect cost data
const costCollectorLambda = new aws.lambda.Function("cost-collector", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambda"),
    }),
    role: lambdaRole.arn,
    handler: "index.handler",
    runtime: "nodejs18.x",
    environment: {
        variables: {
            COST_TABLE_NAME: costDataTable.name,
        },
    },
    timeout: 300,
});

// Set up a daily trigger for the Lambda function
const dailySchedule = new aws.cloudwatch.EventRule("daily-cost-collection", {
    scheduleExpression: "cron(0 1 * * ? *)", // Run at 1:00 AM UTC daily
});

const lambdaTarget = new aws.cloudwatch.EventTarget("cost-collector-target", {
    rule: dailySchedule.name,
    arn: costCollectorLambda.arn,
});

new aws.lambda.Permission("allow-cloudwatch", {
    action: "lambda:InvokeFunction",
    function: costCollectorLambda.name,
    principal: "events.amazonaws.com",
    sourceArn: dailySchedule.arn,
});

// Create a new Lambda function to publish DynamoDB data to CloudWatch
const metricPublisherLambda = new aws.lambda.Function("metric-publisher", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./publisher-lambda"),
    }),
    role: lambdaRole.arn,
    handler: "index.handler",
    runtime: "nodejs18.x",
    environment: {
        variables: {
            COST_TABLE_NAME: costDataTable.name,
        },
    },
    timeout: 300,
});

// Set up a daily trigger for the metrics publisher Lambda function
const metricsSchedule = new aws.cloudwatch.EventRule("daily-metrics-publication", {
    scheduleExpression: "cron(0 2 * * ? *)", // Run at 2:00 AM UTC daily
});

new aws.lambda.Permission("allow-cloudwatch-metrics", {
    action: "lambda:InvokeFunction",
    function: metricPublisherLambda.name,
    principal: "events.amazonaws.com",
    sourceArn: metricsSchedule.arn,
});

// Add CloudWatch permissions to the Lambda role
new aws.iam.RolePolicyAttachment("cloudwatch-metrics", {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.CloudWatchFullAccess,
});

// Create IAM user for Grafana CloudWatch access
const grafanaUser = new aws.iam.User("grafana-cloudwatch-user", {
    name: "grafana-cloudwatch",
    path: "/service-accounts/",
});

// Attach CloudWatch read-only permissions
new aws.iam.UserPolicyAttachment("grafana-cloudwatch-policy", {
    user: grafanaUser.name,
    policyArn: aws.iam.ManagedPolicy.CloudWatchReadOnlyAccess,
});

// Create access key for the user
const grafanaUserKey = new aws.iam.AccessKey("grafana-cloudwatch-key", {
    user: grafanaUser.name,
});

// Set up Grafana provider
const grafanaProvider = new grafana.Provider("grafana", {
    url: grafanaUrl,
    auth: grafanaApiKey,
});

// Create a folder for organizing dashboards
const costFolder = new grafana.oss.Folder("costs", {
    title: "AWS Costs",
    uid: "aws-costs-folder",
}, { provider: grafanaProvider });

// Create a Grafana data source for AWS CloudWatch with proper credentials
const cloudWatchDatasource = new grafana.oss.DataSource("cloudwatch", {
    type: "cloudwatch",
    name: "AWS CloudWatch",
    uid: "aws-cloudwatch-ds",
    jsonDataEncoded: pulumi.jsonStringify({
        authType: "keys",
        defaultRegion: aws.config.region,
    }),
    secureJsonDataEncoded: pulumi.jsonStringify({
        accessKey: grafanaUserKey.id,
        secretKey: grafanaUserKey.secret
    }),
}, { provider: grafanaProvider });

// Create AWS Cost Dashboard in Grafana with fixed dimension queries
const costDashboard = new grafana.oss.Dashboard("aws-cost-dashboard", {
    folder: costFolder.uid,
    configJson: pulumi.jsonStringify({
        title: "AWS Cost Analytics",
        uid: "aws-cost-analytics-uid",
        panels: [
            {
                id: 1,
                gridPos: {
                    h: 8,
                    w: 24,
                    x: 0,
                    y: 0
                },
                title: "Daily AWS Costs by Service (CloudWatch Metrics)",
                type: "timeseries",
                targets: [
                    {
                        refId: "A",
                        datasourceUid: cloudWatchDatasource.uid,
                        namespace: "AWS/CostAnalytics",
                        metricName: "ServiceCost",
                        dimensions: {
                            Currency: "USD",  // Added required Currency dimension
                            Service: "*" 
                        },
                        statistic: "Maximum",
                        period: "86400s"
                    }
                ]
            },
            {
                id: 2,
                gridPos: {
                    h: 8,
                    w: 24,
                    x: 0,
                    y: 8
                },
                title: "Raw Cost Data from CloudWatch",
                type: "table",
                datasource: {
                    type: "cloudwatch",
                    uid: cloudWatchDatasource.uid
                },
                targets: [
                    {
                        refId: "A",
                        namespace: "AWS/CostAnalytics",
                        metricName: "ServiceCost",
                        dimensions: {
                            Currency: "USD",  // Added required Currency dimension
                            Service: "*"
                        },
                        statistic: "Maximum",
                        period: "86400s",
                        format: "table"
                    }
                ],
                options: {
                    showHeader: true,
                    footer: {
                        show: true,
                        reducer: ["sum"],
                        countRows: false
                    },
                    cellHeight: "sm",
                    sortBy: [
                        {
                            desc: true,
                            colIndex: 2
                        }
                    ]
                },
                fieldConfig: {
                    defaults: {
                        custom: {
                            align: "auto",
                            cellOptions: {
                                type: "auto"
                            },
                            inspect: false
                        }
                    },
                    overrides: [
                        {
                            matcher: {
                                id: "byName",
                                options: "Value"
                            },
                            properties: [
                                {
                                    id: "unit",
                                    value: "currencyUSD"
                                }
                            ]
                        }
                    ]
                }
            },
            {
                id: 3,
                gridPos: {
                    h: 8,
                    w: 12,
                    x: 0,
                    y: 16
                },
                title: "Cost Distribution by Service",
                type: "pie",
                datasource: {
                    type: "cloudwatch",
                    uid: cloudWatchDatasource.uid
                },
                targets: [
                    {
                        refId: "A",
                        namespace: "AWS/CostAnalytics",
                        metricName: "ServiceCost",
                        dimensions: {
                            Currency: "USD",  // Added required Currency dimension
                            Service: "*"
                        },
                        statistic: "Maximum",
                        period: "86400s",
                        format: "time_series"
                    }
                ],
                options: {
                    legend: {
                        show: true,
                        position: "right"
                    },
                    pieType: "pie",
                    reduceOptions: {
                        calcs: ["lastNotNull"],
                        fields: "",
                        values: false
                    }
                }
            },
            {
                id: 4,
                gridPos: {
                    h: 8,
                    w: 12,
                    x: 12,
                    y: 16
                },
                title: "Daily Cost Trend",
                type: "timeseries",
                targets: [
                    {
                        refId: "A",
                        namespace: "AWS/CostAnalytics",
                        metricName: "ServiceCost",
                        dimensions: {
                            Currency: "USD",  // Added required Currency dimension
                            Service: "*"
                        },
                        statistic: "Sum",
                        period: "86400s"
                    }
                ],
                options: {
                    legend: {
                        show: true,
                        position: "right"
                    },
                    tooltip: {
                        mode: "single",
                        sort: "none"
                    }
                }
            }
        ],
        time: {
            from: "now-14d",  // Changed to 14 days since CloudWatch only keeps metrics for 14 days
            to: "now"
        },
        refresh: "1h",  // Changed to 1 hour for more frequent updates
        tags: ["aws", "costs", "analytics"],
        timezone: "browser",
        schemaVersion: 36,
        version: 1,
    }),
}, { provider: grafanaProvider });

// Create a test dashboard with minimal configuration
// Add this to your Pulumi file
const testDashboard = new grafana.oss.Dashboard("test-dashboard", {
    folder: costFolder.uid,
    configJson: pulumi.jsonStringify({
        title: "Simple CloudWatch Test",
        uid: "cloudwatch-test-uid",
        panels: [
            {
                id: 1,
                gridPos: {
                    h: 8,
                    w: 24,
                    x: 0,
                    y: 0
                },
                title: "Simple Test Panel",
                type: "timeseries",
                targets: [
                    {
                        refId: "A",
                        expression: "SELECT MAX(\"ServiceCost\") FROM \"AWS/CostAnalytics\" GROUP BY \"Service\"",
                        queryType: "metricInsights"
                    }
                ]
            }
        ],
        time: {
            from: "now-6h",
            to: "now"
        },
        refresh: "1m"
    }),
}, { provider: grafanaProvider });

export const testDashboardUrl = pulumi.interpolate`${grafanaUrl}/d/${testDashboard.uid}`;

// Export important values
export const dashboardUrl = pulumi.interpolate`${grafanaUrl}/d/${costDashboard.uid}`;
export const dynamoDbTableName = costDataTable.name;
export const lambdaName = costCollectorLambda.name;
export const metricPublisherLambdaName = metricPublisherLambda.name;
export const grafanaAccessKey = grafanaUserKey.id;
export const grafanaSecretKey = grafanaUserKey.secret;