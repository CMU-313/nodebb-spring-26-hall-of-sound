# Install Flow type checking and Babel dependencies for NodeBB
# Run this once after cloning: bash install-flow.sh

npm install --save-dev \
  flow-bin@0.241.0 \
  @babel/cli \
  @babel/core \
  @babel/preset-flow \
  babel-plugin-syntax-hermes-parser
