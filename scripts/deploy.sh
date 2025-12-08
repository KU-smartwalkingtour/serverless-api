#!/bin/bash
set -e

echo "=== Full Deploy ==="

# Build layer and functions
./scripts/build-layer.sh
./scripts/build-functions.sh

# Navigate to terraform
cd terraform

# Initialize and apply
terraform init
terraform plan -var-file="environments/prod.tfvars"
terraform apply -var-file="environments/prod.tfvars" -auto-approve

echo "Deployment complete!"
