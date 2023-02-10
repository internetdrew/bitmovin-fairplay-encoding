import express from 'express';
import * as dotenv from 'dotenv';
import { join } from 'path';
import BitmovinApi, {
  AacAudioConfiguration,
  AclEntry,
  AclPermission,
  CencDrm,
  CencPlayReady,
  CencWidevine,
  CloudRegion,
  ConsoleLogger,
  DashManifestDefault,
  DashManifestDefaultVersion,
  Encoding,
  EncodingOutput,
  EncodingStreamInput,
  Fmp4Muxing,
  H264VideoConfiguration,
  HlsManifestDefault,
  HlsManifestDefaultVersion,
  HttpsInput,
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

const exampleName = 'CencDrmContentProtection';

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
    bucketName: process.env.S3_BUCKET_NAME,
  });

  return bitmovinApi.encoding.inputs.s3.create(s3Input);
};

function createS3Output(name) {
  const createdS3Output = new S3Output({
    name,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_BUCKET_NAME,
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
  const widevineDrm = new CencWidevine({
    pssh: process.env.CENC_WIDEVINE_PSSH,
  });

  const playreadyDrm = new CencPlayReady({
    laUrl: process.env.CENC_PLAYREADY_LA_URL,
  });

  const cencDrm = new CencDrm({
    outputs: [buildEncodingOutput(output, outputPath)],
    key: process.env.CENC_KEY,
    kid: process.env.CENC_KID,
    widevine: widevineDrm,
    playReady: playreadyDrm,
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
};

const executeEncoding = async (encoding, startEncodingRequest) => {
  await bitmovinApi.encoding.encodings.start(encoding.id, startEncodingRequest);

  let task;
  do {
    await timeout(5000);
    task = await bitmovinApi.encoding.encodings.status(encoding.id);
  } while (task.status !== Status.FINISHED && task.status !== Status.ERROR);

  if (task.status === Status.ERROR) {
    logTaskErrors(task);
    throw new Error('Encoding failed');
  }

  console.log('Encoding finished successfully');
};

/*

MAIN FUNCTION...

*/

const main = async () => {
  const encoding = await createEncoding(
    exampleName,
    'Example with CENC DRM protection'
  );

  const input = await createS3Input();
  const inputFilePath = process.env.S3_INPUT_PATH;

  const output = await createS3Output('Fragmented Output');

  const videoCodecConfiguration1 = await createH264VideoConfig(
    'Starting H264 config 1',
    1500000,
    1024
  );
  /*
  const videoCodecConfiguration2 = await createH264VideoConfig(
    'Starting H264 config 2',
    1000000,
    768
  );
  const videoCodecConfiguration3 = await createH264VideoConfig(
    'Starting H264 config 3',
    750000,
    640
  );

  */

  const audioCodecConfiguration = await createAacAudioConfig(
    'Starting audio codec config',
    128000
  );

  const videoStream = await createStream(
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

  const videoMuxing = await createFmp4Muxing(encoding, videoStream);
  const audioMuxing = await createFmp4Muxing(encoding, audioStream);

  await createDrmConfig(encoding, videoMuxing, output, 'video');
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

/////////////// Old code lives below here /////////////////////

// const videoStream1 = await bitmovinApi.encoding.encodings.streams.create(
//   encoding.id,
//   new Stream({
//     codecConfigId: videoCodecConfiguration1.id,
//     inputStreams: [videoStreamInput],
//   })
// );
// const videoStream2 = await bitmovinApi.encoding.encodings.streams.create(
//   encoding.id,
//   new Stream({
//     codecConfigId: videoCodecConfiguration2.id,
//     inputStreams: [videoStreamInput],
//   })
// );
// const videoStream3 = await bitmovinApi.encoding.encodings.streams.create(
//   encoding.id,
//   new Stream({
//     codecConfigId: videoCodecConfiguration3.id,
//     inputStreams: [videoStreamInput],
//   })
// );

// const outputPath = process.env.S3_OUTPUT_PATH;
// const segmentNaming = 'seg_%number%.m4s';
// const initSegmentName = 'init.mp4';

// const videoMuxing1 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
//   encoding.id,
//   new Fmp4Muxing({
//     segmentLength,
//     segmentNaming,
//     initSegmentName,
//     streams: [new MuxingStream({ streamId: videoStream1.id })],
//     outputs: [
//       new EncodingOutput({
//         outputId,
//         outputPath,
//         acl: [aclEntry],
//       }),
//     ],
//   })
// );
// const videoMuxing2 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
//   encoding.id,
//   new Fmp4Muxing({
//     segmentLength,
//     segmentNaming,
//     initSegmentName,
//     streams: [new MuxingStream({ streamId: videoStream2.id })],
//     outputs: [
//       new EncodingOutput({
//         outputId,
//         outputPath,
//         acl: [aclEntry],
//       }),
//     ],
//   })
// );
// const videoMuxing3 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
//   encoding.id,
//   new Fmp4Muxing({
//     segmentLength,
//     segmentNaming,
//     initSegmentName,
//     streams: [new MuxingStream({ streamId: videoStream3.id })],
//     outputs: [
//       new EncodingOutput({
//         outputId: output.id,
//         outputPath,
//         acl: [aclEntry],
//       }),
//     ],
//   })
// );

// const audioMuxing = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
//   encoding.id,
//   new Fmp4Muxing({
//     segmentLength,
//     segmentNaming,
//     initSegmentName,
//     streams: [new MuxingStream({ streamId: audioStream.id })],
//     outputs: [
//       new EncodingOutput({
//         outputId,
//         outputPath,
//         acl: [aclEntry],
//       }),
//     ],
//   })
// );

// await bitmovinApi.encoding.encodings.muxings.fmp4.drm.cenc.create(
//   encoding.id,
//   videoMuxing1.id,
//   cencDrm
// );
// await bitmovinApi.encoding.encodings.muxings.fmp4.drm.cenc.create(
//   encoding.id,
//   videoMuxing2.id,
//   cencDrm
// );
// await bitmovinApi.encoding.encodings.muxings.fmp4.drm.cenc.create(
//   encoding.id,
//   videoMuxing3.id,
//   cencDrm
// );
// await bitmovinApi.encoding.encodings.muxings.fmp4.drm.cenc.create(
//   encoding.id,
//   audioMuxing.id,
//   cencDrm
// );

// const manifestOutput = new EncodingOutput({
//   outputId,
//   outputPath,
//   acl: [
//     new AclEntry({
//       permission: AclPermission.PUBLIC_READ,
//       scope: '*',
//     }),
//   ],
// });

// let dashManifest = new DashManifestDefault({
//   manifestName: 'stream.mpd',
//   encodingId: encoding.id,
//   version: DashManifestDefaultVersion.V2,
//   outputs: [manifestOutput],
// });

// dashManifest = await bitmovinApi.encoding.manifests.dash.default.create(
//   dashManifest
// );

// let hlsManifest = new HlsManifestDefault({
//   manifestName: 'stream.m3u8',
//   encodingId: encoding.id,
//   version: HlsManifestDefaultVersion.V1,
//   outputs: [manifestOutput],
// });

// hlsManifest = await bitmovinApi.encoding.manifests.hls.default.create(
//   hlsManifest
// );

// const startEncodingRequest = new StartEncodingRequest({
//   manifestGenerator: ManifestGenerator.V2,
//   vodDashManifests: [new ManifestResource({ manifestId: dashManifest.id })],
//   vodHlsManifests: [new ManifestResource({ manifestId: hlsManifest.id })],
// });

// await bitmovinApi.encoding.encodings.start(encoding.id, startEncodingRequest);

app.get('/', async (req, res) => {
  res.send('Working...');
});

app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
