#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing AWS Cost Metrics Publisher Lambda${NC}"
echo "============================================"

# Get Lambda name from Pulumi stack
echo "Checking Pulumi stack outputs..."
LAMBDA_NAME=$(pulumi stack output metricPublisherLambdaName 2>/dev/null)

if [ -z "$LAMBDA_NAME" ]; then
    echo -e "${RED}Error: Could not find metrics publisher Lambda name in Pulumi stack output${NC}"
    echo -e "${YELLOW}This is normal if you haven't deployed the latest changes yet${NC}"
    echo -e "${YELLOW}To add the metric publisher, run 'pulumi up'${NC}"
    exit 1
fi

echo -e "\n${BLUE}Invoking metrics publisher Lambda function: $LAMBDA_NAME${NC}"

# Invoke Lambda with empty payload
RESPONSE=$(aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload '{}' \
    --cli-binary-format raw-in-base64-out \
    response.json)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Lambda invocation successful!${NC}"
    echo -e "\n${BLUE}Response:${NC}"
    cat response.json
    
    # Check if there are CloudWatch Logs
    echo -e "\n${BLUE}Checking CloudWatch logs for Lambda execution...${NC}"
    
    # Get the latest log stream
    LATEST_STREAM=$(aws logs describe-log-streams \
        --log-group-name "/aws/lambda/$LAMBDA_NAME" \
        --order-by LastEventTime \
        --descending \
        --limit 1 \
        --query 'logStreams[0].logStreamName' \
        --output text 2>/dev/null)
    
    if [ "$LATEST_STREAM" != "None" ] && [ ! -z "$LATEST_STREAM" ]; then
        echo -e "${BLUE}Getting recent logs from $LATEST_STREAM${NC}"
        aws logs get-log-events \
            --log-group-name "/aws/lambda/$LAMBDA_NAME" \
            --log-stream-name "$LATEST_STREAM" \
            --limit 20 \
            --query 'events[*].message' \
            --output text
    else
        echo -e "${YELLOW}No log streams found for Lambda function.${NC}"
        echo -e "${YELLOW}This might be because:${NC}"
        echo -e "1. The Lambda function hasn't generated any logs yet"
        echo -e "2. The Lambda function doesn't have CloudWatch Logs permissions"
        echo -e "3. The log group hasn't been created yet"
    fi
    
    rm response.json
else
    echo -e "${RED}Error invoking Lambda function${NC}"
    cat response.json
    rm response.json
    exit 1
fi

echo -e "\n${GREEN}Test completed successfully!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Check AWS CloudWatch metrics in namespace 'AWS/CostAnalytics'"
echo "2. Verify the Grafana dashboard is showing data" 