#!/bin/bash

# Get the Lambda function name from Pulumi stack
LAMBDA_NAME=$(pulumi stack output lambdaName)

if [ -z "$LAMBDA_NAME" ]; then
    echo "Error: Could not find Lambda function name in Pulumi stack output"
    exit 1
fi

echo "Invoking cost collector Lambda function: $LAMBDA_NAME"

# Invoke the Lambda function
RESPONSE=$(aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload '{}' \
    --cli-binary-format raw-in-base64-out \
    response.json)

# Check if the invocation was successful
if [ $? -eq 0 ]; then
    echo "Lambda invocation successful!"
    echo "Response:"
    cat response.json
    rm response.json
else
    echo "Error invoking Lambda function"
    exit 1
fi 