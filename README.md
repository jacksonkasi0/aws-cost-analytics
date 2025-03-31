# AWS Cost Analytics Dashboard

A comprehensive solution for tracking and visualizing AWS costs using Pulumi, AWS Lambda, DynamoDB, CloudWatch, and Grafana.

![AWS Cost Dashboard](https://raw.githubusercontent.com/pulumiverse/pulumi-grafana/main/.github/grafana-logo.png)

## Overview

This project creates an automated AWS cost analytics solution that:

1. Collects daily AWS cost data using the AWS Cost Explorer API
2. Stores historical cost data in Amazon DynamoDB
3. Publishes metrics to Amazon CloudWatch
4. Visualizes cost data in a Grafana dashboard

The solution is fully automated and deployed using Pulumi Infrastructure as Code.

## Architecture

![Architecture Diagram](https://github.com/aws-samples/aws-cost-explorer-report/raw/main/images/architecture-diagram.png)

The architecture consists of:

- **Lambda Function (Cost Collector)**: Runs daily to fetch AWS cost data from Cost Explorer API and stores it in DynamoDB
- **Lambda Function (Metrics Publisher)**: Reads cost data from DynamoDB and publishes it to CloudWatch as custom metrics
- **DynamoDB Table**: Stores historical cost data
- **CloudWatch Events**: Triggers both Lambda functions on a scheduled basis
- **CloudWatch Metrics**: Stores service cost metrics
- **Grafana Dashboard**: Visualizes cost data with multiple panels

## Prerequisites

- AWS Account and credentials configured locally
- Pulumi CLI installed
- Node.js v14+ and npm
- Grafana Cloud account (or self-hosted Grafana instance)

## Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd aws-cost-dashboard
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up Pulumi configuration with your Grafana details:
   ```
   pulumi config set grafana:url https://your-org.grafana.net
   pulumi config set grafana:auth <your-grafana-api-key> --secret
   ```

4. Deploy the infrastructure:
   ```
   pulumi up
   ```

## Testing

To test the Lambda functions without waiting for the scheduled trigger:

```
./test-cost-lambda.sh
```

This script will:
1. Invoke the cost collector Lambda to fetch cost data from AWS Cost Explorer
2. Wait for DynamoDB to update
3. Invoke the metrics publisher Lambda to publish metrics to CloudWatch

## Dashboard Details

The Grafana dashboard provides several visualizations:

1. **Daily AWS Costs by Service**: Time series chart showing cost trends by service
2. **Raw Cost Data**: Tabular view of cost data
3. **Cost Distribution by Service**: Pie chart showing relative cost percentages
4. **Daily Cost Trend**: Line chart showing overall daily cost trends

## Customization

You can customize this solution by:

1. Modifying `lambda/index.js` to adjust how cost data is collected
2. Updating `publisher-lambda/index.js` to change how metrics are published
3. Editing the dashboard configuration in `index.ts` to add or modify visualization panels

## Troubleshooting

### Common Issues

1. **No data in Grafana**: 
   - Ensure both Lambda functions have successfully executed
   - Check CloudWatch metrics in the AWS/CostAnalytics namespace
   - Verify Grafana is correctly configured to access CloudWatch

2. **Lambda execution errors**:
   - Check Lambda logs in CloudWatch Logs
   - Ensure IAM permissions are correctly configured

3. **CloudWatch metric errors**:
   - CloudWatch only accepts metrics with timestamps within the past two weeks
   - Ensure the metric unit is valid (currently set to 'Count')

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- AWS Cost Explorer API
- Pulumi Framework
- Pulumiverse Grafana Provider

## Environment Configuration

This project uses environment variables for sensitive configuration. To set up:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your actual values:
   ```bash
   # Use your text editor to modify .env
   nano .env
   ```

3. Set up Pulumi to use the environment variables:
   ```bash
   # Set Grafana API key
   export GRAFANA_API_KEY=your-api-key-here
   
   # Configure Pulumi
   pulumi config set grafanaUrl https://your-grafana-instance.grafana.net
   ```

**Important:** Never commit the `.env` file to version control. It's automatically ignored via `.gitignore`. 