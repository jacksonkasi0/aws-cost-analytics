#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}AWS Cost Analytics Lambda Test${NC}"
echo "============================================"
echo "Current date: $(date -u)"
echo "Starting test..."

# Function to check if Lambda exists
check_lambda() {
    local lambda_name=$1
    if ! aws lambda get-function --function-name "$lambda_name" &>/dev/null; then
        echo -e "${RED}Lambda function $lambda_name not found. Please check the name and AWS CLI configuration.${NC}"
        return 1
    fi
    return 0
}

# Function to invoke Lambda and show response
invoke_lambda() {
    local lambda_name=$1
    local description=$2
    
    echo -e "\n${BLUE}Invoking $description Lambda function: $lambda_name${NC}"
    
    # Invoke the Lambda function
    RESPONSE=$(aws lambda invoke \
        --function-name "$lambda_name" \
        --payload '{}' \
        --cli-binary-format raw-in-base64-out \
        response.json)
    
    # Check if the invocation was successful
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Lambda invocation successful!${NC}"
        echo "Response:"
        cat response.json
        rm response.json
    else
        echo -e "${RED}Error invoking Lambda function${NC}"
        exit 1
    fi
}

# Get Lambda names from Pulumi stack
echo "Checking Pulumi stack outputs..."
COST_COLLECTOR_NAME=$(pulumi stack output lambdaName 2>/dev/null)
METRIC_PUBLISHER_NAME=$(pulumi stack output metricPublisherLambdaName 2>/dev/null)

# Check if we have at least the cost collector Lambda
if [ -z "$COST_COLLECTOR_NAME" ]; then
    echo -e "${RED}Error: Could not find cost collector Lambda name in Pulumi stack output${NC}"
    echo -e "${YELLOW}Please run 'pulumi up' to deploy the latest changes${NC}"
    exit 1
fi

# If metric publisher Lambda is not found, we'll only test the cost collector
if [ -z "$METRIC_PUBLISHER_NAME" ]; then
    echo -e "${YELLOW}Warning: Metric publisher Lambda not found in stack output${NC}"
    echo -e "${YELLOW}This is normal if you haven't deployed the latest changes yet${NC}"
    echo -e "${YELLOW}To add the metric publisher, run 'pulumi up'${NC}"
    echo -e "\n${BLUE}Testing only the cost collector Lambda...${NC}"
    
    # Test Cost Collector Lambda
    if check_lambda "$COST_COLLECTOR_NAME"; then
        invoke_lambda "$COST_COLLECTOR_NAME" "cost collector"
    else
        exit 1
    fi
else
    # Test both Lambdas
    echo -e "\n${BLUE}Testing both Lambda functions...${NC}"
    
    # Test Cost Collector Lambda
    echo -e "\nStep 1: Testing Cost Collector Lambda"
    if check_lambda "$COST_COLLECTOR_NAME"; then
        invoke_lambda "$COST_COLLECTOR_NAME" "cost collector"
    else
        exit 1
    fi

    # Wait a bit for DynamoDB to be updated
    echo -e "\nWaiting 5 seconds for DynamoDB to be updated..."
    sleep 5

    # Test Metric Publisher Lambda
    echo -e "\nStep 2: Testing Metric Publisher Lambda"
    if check_lambda "$METRIC_PUBLISHER_NAME"; then
        invoke_lambda "$METRIC_PUBLISHER_NAME" "metric publisher"
    else
        exit 1
    fi
fi

echo -e "\n${GREEN}Test completed successfully!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Check AWS CloudWatch metrics in namespace 'AWS/CostAnalytics'"
echo "2. Verify the Grafana dashboard at:"
echo "   https://jacksonkasi.grafana.net/d/aws-cost-analytics-uid/aws-cost-analytics"
echo "3. If no data appears, allow up to 15 minutes for CloudWatch metrics to propagate"