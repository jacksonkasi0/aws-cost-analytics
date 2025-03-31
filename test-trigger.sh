#!/bin/bash

# Get the Lambda function name from Pulumi stack
LAMBDA_NAME=$(pulumi stack output lambdaName)

if [ -z "$LAMBDA_NAME" ]; then
    echo "Error: Could not get Lambda function name from Pulumi stack"
    exit 1
fi

echo "Invoking Lambda function: $LAMBDA_NAME"

# Invoke the Lambda function
RESPONSE=$(aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload '{}' \
    --cli-binary-format raw-in-base64-out \
    response.json)

# Check the response
if [ $? -eq 0 ]; then
    echo "Lambda invocation successful!"
    echo "Response:"
    cat response.json
    rm response.json
else
    echo "Error invoking Lambda function"
    exit 1
fi

# Get the Grafana dashboard URL
DASHBOARD_URL=$(pulumi stack output dashboardUrl)
echo -e "\nGrafana Dashboard URL: $DASHBOARD_URL"
echo "You can access the dashboard to view the cost data"