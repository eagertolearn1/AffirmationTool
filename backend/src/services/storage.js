const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');

const s3 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Upload a buffer to R2.
 * @param {string} key         - R2 object key (path in bucket)
 * @param {Buffer} buffer      - file content
 * @param {string} contentType - MIME type
 */
async function uploadFile(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  logger.debug({ key, bytes: buffer.length }, 'File uploaded to R2');
  return key;
}

/**
 * Generate a pre-signed GET URL for a private R2 object.
 * @param {string} key        - R2 object key
 * @param {number} expiresIn  - TTL in seconds (default 3600 = 1 hour)
 */
async function getSignedUrl(key, expiresIn = 3600) {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await awsGetSignedUrl(s3, command, { expiresIn });
  } catch (err) {
    logger.error({ err, key }, 'Failed to generate signed URL');
    return null;
  }
}

/**
 * Build the standard R2 path for a journey asset.
 */
function assetPath(journeyId, dayNumber, filename) {
  const day = String(dayNumber).padStart(2, '0');
  return `journeys/${journeyId}/day-${day}/${filename}`;
}

function previewAudioPath(journeyId)  { return `journeys/${journeyId}/preview/day1-preview.mp3`; }
function previewInfographicPath(journeyId) { return `journeys/${journeyId}/preview/day1-infographic.jpg`; }
function progressCardPath(journeyId, dayNumber) {
  return `journeys/${journeyId}/progress-cards/day-${String(dayNumber).padStart(2, '0')}-card.jpg`;
}
function voiceSamplePath(journeyId) { return `journeys/${journeyId}/voice-sample/raw.wav`; }

module.exports = { uploadFile, getSignedUrl, assetPath, previewAudioPath, previewInfographicPath, progressCardPath, voiceSamplePath };
