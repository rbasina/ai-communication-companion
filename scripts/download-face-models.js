const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const modelsDir = path.resolve(__dirname, '../public/models');
const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// Ensure the models directory exists
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log(`Created directory: ${modelsDir}`);
}

// Models to download
const models = [
  // TinyFaceDetector
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  
  // Face Expression
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1',
];

// Function to download a file
const downloadFile = (fileName) => {
  return new Promise((resolve, reject) => {
    const fileUrl = `${baseUrl}/${fileName}`;
    const filePath = path.join(modelsDir, fileName);
    
    console.log(`Downloading ${fileName}...`);
    
    const file = fs.createWriteStream(filePath);
    https.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${fileName}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${fileName}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file if download failed
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file if writing failed
      reject(err);
    });
  });
};

// Download all models
const downloadAllModels = async () => {
  try {
    for (const model of models) {
      await downloadFile(model);
    }
    console.log('All models downloaded successfully!');
  } catch (error) {
    console.error('Error downloading models:', error);
    process.exit(1);
  }
};

downloadAllModels(); 