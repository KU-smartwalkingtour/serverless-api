#!/bin/bash
set -e

echo "=== Building Lambda Layer ==="

LAYER_DIR="src/layers/common/nodejs"
DIST_DIR="dist/layers"

# Create dist directory
mkdir -p $DIST_DIR

# Navigate to layer directory
cd $LAYER_DIR

# Install production dependencies
echo "Installing dependencies..."
npm ci --production

# Navigate back to root
cd ../../../..

# Create layer zip
echo "Creating layer zip..."
cd src/layers/common
zip -r ../../../$DIST_DIR/common-layer.zip nodejs
cd ../../..

echo "Layer build complete: $DIST_DIR/common-layer.zip"
