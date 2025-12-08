#!/bin/bash
set -e

echo "=== Building Lambda Functions ==="

FUNCTIONS_DIR="src/functions"
DIST_DIR="dist/functions"

# Create dist directory
mkdir -p $DIST_DIR

# Function to build a single function from a directory
build_function() {
  local func_path=$1
  local func_name=$2

  echo "Building function: $func_name"

  # Create function zip
  cd "$func_path"
  zip -r "../../../$DIST_DIR/$func_name.zip" . -x "*.DS_Store"
  cd - > /dev/null
}

# Build nested functions (auth/login, user/profile, etc.)
find_and_build() {
  local base_dir=$1

  for category_dir in "$base_dir"/*/; do
    if [ -d "$category_dir" ]; then
      local category_name=$(basename "$category_dir")

      # Check if this directory has an index.js (it's a function itself)
      if [ -f "$category_dir/index.js" ]; then
        build_function "$category_dir" "$category_name"
      else
        # It's a category folder, check subdirectories
        for func_dir in "$category_dir"/*/; do
          if [ -d "$func_dir" ] && [ -f "$func_dir/index.js" ]; then
            local func_name=$(basename "$func_dir")
            local full_name="$category_name-$func_name"
            build_function "$func_dir" "$full_name"
          else
            # Check for deeper nesting (e.g., user/saved-courses/get)
            for nested_dir in "$func_dir"/*/; do
              if [ -d "$nested_dir" ] && [ -f "$nested_dir/index.js" ]; then
                local parent_name=$(basename "$func_dir")
                local nested_name=$(basename "$nested_dir")
                local full_name="$category_name-$parent_name-$nested_name"
                build_function "$nested_dir" "$full_name"
              fi
            done
          fi
        done
      fi
    fi
  done
}

# Start building from functions directory
find_and_build "$FUNCTIONS_DIR"

echo ""
echo "Functions build complete: $DIST_DIR/"
ls -la $DIST_DIR/
