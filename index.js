import express from 'express';
import * as dotenv from 'dotenv';
import { XMLParser } from 'fast-xml-parser';
import { join } from 'path';
import BitmovinApi, {
  AacAudioConfiguration,
  AclEntry,
  AclPermission,
  CencDrm,
  CencFairPlay,
  ConsoleLogger,
  DashManifestDefault,
  DashManifestDefaultVersion,
  Encoding,
  EncodingOutput,
  Fmp4Muxing,
  H264VideoConfiguration,
  HlsManifestDefault,
  HlsManifestDefaultVersion,
  ManifestGenerator,
  ManifestResource,
  MuxingStream,
  PresetConfiguration,
  S3Input,
  S3Output,
  StartEncodingRequest,
  Stream,
  StreamInput,
  StreamSelectionMode,
} from '@bitmovin/api-sdk';
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

const exampleName = 'FairPlaySolo';

const parser = new XMLParser();

const xmlData = await fetch(
  `http://fps.ezdrm.com/api/keys?u=${process.env.EZDRM_USERNAME}&p=${process.env.EZDRM_PASSWORD} `,
  {
    method: 'POST',
  }
).then(res => res.text());

const fairPlayData = parser.parse(xmlData).FairPlay;
const fairPlayKey = fairPlayData.KeyHEX.slice(0, 32);
const fairPlayIv = fairPlayData.KeyHEX.slice(32);
const fairPlayUri = fairPlayData.KeyUri;

const cpixResults = await fetch(
  `https://cpix.ezdrm.com/KeyGenerator/cpix.aspx?k=${fairPlayData.AssetID}&u=${process.env.EZDRM_USERNAME}&p=${process.env.EZDRM_PASSWORD}&c=resourcename&m=2`,
  { method: 'POST' }
).then(res => res.text());

const cpixParsed = parser.parse(cpixResults);

const bitmovinApi = new BitmovinApi.default({
  apiKey: process.env.BITMOVIN_API_KEY,
  logger: new ConsoleLogger(),
});

const createEncoding = (name, description) => {
  const encoding = new Encoding({
    name,
    description,
  });

  return bitmovinApi.encoding.encodings.create(encoding);
};

const createS3Input = () => {
  const s3Input = new S3Input({
    name: process.env.S3_INPUT_NAME,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_INPUT_BUCKET_NAME,
  });

  return bitmovinApi.encoding.inputs.s3.create(s3Input);
};

function createS3Output(name) {
  const createdS3Output = new S3Output({
    name,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_OUTPUT_BUCKET_NAME,
  });

  return bitmovinApi.encoding.outputs.s3.create(createdS3Output);
}

const buildAbsolutePath = relativePath => {
  return join(process.env.S3_OUTPUT_PATH, exampleName, relativePath);
};

const buildEncodingOutput = (output, outputPath) => {
  const aclEntry = new AclEntry({
    permission: AclPermission.PUBLIC_READ,
  });

  return new EncodingOutput({
    outputPath: buildAbsolutePath(outputPath),
    outputId: output.id,
    acl: [aclEntry],
  });
};

const createH264VideoConfig = (name, bitrate, width) => {
  const config = new H264VideoConfiguration({
    name,
    bitrate,
    width,
    presetConfiguration: PresetConfiguration.VOD_STANDARD,
  });

  return bitmovinApi.encoding.configurations.video.h264.create(config);
};

const createAacAudioConfig = (name, bitrate) => {
  const config = new AacAudioConfiguration({
    name,
    bitrate,
  });

  return bitmovinApi.encoding.configurations.audio.aac.create(config);
};

const createStream = (encoding, input, inputPath, codecConfiguration) => {
  const streamInput = new StreamInput({
    inputId: input.id,
    inputPath,
    selectionMode: StreamSelectionMode.AUTO,
  });

  const stream = new Stream({
    inputStreams: [streamInput],
    codecConfigId: codecConfiguration.id,
  });

  return bitmovinApi.encoding.encodings.streams.create(encoding.id, stream);
};

const createFmp4Muxing = (encoding, stream) => {
  const muxingStream = new MuxingStream({
    streamId: stream.id,
  });

  const muxing = new Fmp4Muxing({
    streams: [muxingStream],
    segmentLength: 4,
  });

  return bitmovinApi.encoding.encodings.muxings.fmp4.create(
    encoding.id,
    muxing
  );
};

const createDrmConfig = (encoding, muxing, output, outputPath) => {
  const fairplayDrm = new CencFairPlay({
    iv: fairPlayIv,
    uri: fairPlayUri,
  });

  const cencDrm = new CencDrm({
    outputs: [buildEncodingOutput(output, outputPath)],
    key: fairPlayKey,
    kid: fairPlayData.KeyID,
    fairPlay: fairplayDrm,
    encryptionMode: 'CBC',
  });

  return bitmovinApi.encoding.encodings.muxings.fmp4.drm.cenc.create(
    encoding.id,
    muxing.id,
    cencDrm
  );
};

const createDefaultDashManifest = async (
  encoding,
  output,
  outputPath,
  manifestName
) => {
  let dashManifest = new DashManifestDefault({
    encodingId: encoding.id,
    manifestName,
    version: DashManifestDefaultVersion.V1,
    outputs: [buildEncodingOutput(output, outputPath)],
  });

  return await bitmovinApi.encoding.manifests.dash.default.create(dashManifest);
};

const createDefaultHlsDashManifest = async (
  encoding,
  output,
  outputPath,
  manifestName
) => {
  let hlsManifestDefault = new HlsManifestDefault({
    encodingId: encoding.id,
    outputs: [buildEncodingOutput(output, outputPath)],
    name: manifestName,
    manifestName,
    version: HlsManifestDefaultVersion.V1,
  });

  return await bitmovinApi.encoding.manifests.hls.default.create(
    hlsManifestDefault
  );
};

const buildManifestResource = manifest => {
  return new ManifestResource({
    manifestId: manifest.id,
  });
};

const timeout = milliseconds => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

const logTaskErrors = task => {
  if (task.messages == undefined) return;
  console.log(task);
};

const executeEncoding = async (encoding, startEncodingRequest) => {
  await bitmovinApi.encoding.encodings.start(encoding.id, startEncodingRequest);
};

/*

MAIN FUNCTION...

*/

const main = async () => {
  const encoding = await createEncoding(exampleName, 'FairPlay with CBC');

  const input = await createS3Input();
  const inputFilePath = process.env.S3_INPUT_PATH;

  const output = await createS3Output('Fairplay Output');

  const videoCodecConfiguration1 = await createH264VideoConfig(
    'Starting H264 config 1',
    1500000,
    1024
  );

  const audioCodecConfiguration = await createAacAudioConfig(
    'Starting audio codec config',
    128000
  );

  const videoStream1 = await createStream(
    encoding,
    input,
    inputFilePath,
    videoCodecConfiguration1
  );

  const audioStream = await createStream(
    encoding,
    input,
    inputFilePath,
    audioCodecConfiguration
  );

  const videoMuxing1 = await createFmp4Muxing(encoding, videoStream1);
  const audioMuxing = await createFmp4Muxing(encoding, audioStream);

  await createDrmConfig(encoding, videoMuxing1, output, 'video');
  await createDrmConfig(encoding, audioMuxing, output, 'audio');

  const dashManifest = await createDefaultDashManifest(
    encoding,
    output,
    '/',
    'stream.mpd'
  );
  const hlsManifest = await createDefaultHlsDashManifest(
    encoding,
    output,
    '/',
    'stream.m3u8'
  );

  const startEncodingRequest = new StartEncodingRequest({
    manifestGenerator: ManifestGenerator.V2,
    vodDashManifests: [buildManifestResource(dashManifest)],
    vodHlsManifests: [buildManifestResource(hlsManifest)],
  });

  await executeEncoding(encoding, startEncodingRequest);
};

main();

app.get('/', async (req, res) => {
  res.send(new CencDrm());
});

app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
