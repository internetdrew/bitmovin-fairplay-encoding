import express from 'express';
import * as dotenv from 'dotenv';
import BitmovinApi, {
  AacAudioConfiguration,
  AclEntry,
  AclPermission,
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

const bitmovinApi = new BitmovinApi.default({
  apiKey: process.env.BITMOVIN_API_KEY,
});

const input = await bitmovinApi.encoding.inputs.s3.create(
  new S3Input({
    name: process.env.S3_INPUT_NAME,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_BUCKET_NAME,
  })
);

const output = await bitmovinApi.encoding.outputs.s3.create(
  new S3Output({
    name: 'Big Buck Bunny Output',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucketName: process.env.S3_BUCKET_NAME,
  })
);

const outputId = output.id;

const videoCodecConfiguration1 =
  await bitmovinApi.encoding.configurations.video.h264.create(
    new H264VideoConfiguration({
      name: 'Starting H264 config 1',
      bitrate: 1500000,
      width: 1024,
      presetConfiguration: PresetConfiguration.VOD_STANDARD,
    })
  );
const videoCodecConfiguration2 =
  await bitmovinApi.encoding.configurations.video.h264.create(
    new H264VideoConfiguration({
      name: 'Starting H264 config 2',
      bitrate: 1000000,
      width: 768,
      presetConfiguration: PresetConfiguration.VOD_STANDARD,
    })
  );
const videoCodecConfiguration3 =
  await bitmovinApi.encoding.configurations.video.h264.create(
    new H264VideoConfiguration({
      name: 'Starting H264 config 3',
      bitrate: 750000,
      width: 640,
      presetConfiguration: PresetConfiguration.VOD_STANDARD,
    })
  );

const audioCodecConfiguration =
  await bitmovinApi.encoding.configurations.audio.aac.create(
    new AacAudioConfiguration({
      name: 'Starting audio codec config',
      bitrate: 128000,
    })
  );

const encoding = await bitmovinApi.encoding.encodings.create(
  new Encoding({
    name: 'Starting encoding',
    cloudRegion: CloudRegion.AWS_US_EAST_1,
  })
);

const inputPath = process.env.S3_INPUT_PATH;

const videoStreamInput = new StreamInput({
  inputId: input.id,
  inputPath,
  selectionMode: StreamSelectionMode.AUTO,
});

const videoStream1 = await bitmovinApi.encoding.encodings.streams.create(
  encoding.id,
  new Stream({
    codecConfigId: videoCodecConfiguration1.id,
    inputStreams: [videoStreamInput],
  })
);
const videoStream2 = await bitmovinApi.encoding.encodings.streams.create(
  encoding.id,
  new Stream({
    codecConfigId: videoCodecConfiguration2.id,
    inputStreams: [videoStreamInput],
  })
);
const videoStream3 = await bitmovinApi.encoding.encodings.streams.create(
  encoding.id,
  new Stream({
    codecConfigId: videoCodecConfiguration3.id,
    inputStreams: [videoStreamInput],
  })
);

const audioStreamInput = new EncodingStreamInput({
  inputId: input.id,
  inputPath,
  selectionMode: StreamSelectionMode.AUTO,
});

const audioStream = await bitmovinApi.encoding.encodings.streams.create(
  encoding.id,
  new Stream({
    codecConfigId: audioCodecConfiguration.id,
    inputStreams: [audioStreamInput],
  })
);

const aclEntry = new AclEntry({
  permission: AclPermission.PUBLIC_READ,
});

const segmentLength = 4;
const outputPath = 'output/';
const segmentNaming = 'seg_%number%.m4s';
const initSegmentName = 'init.mp4';

const videoMuxing1 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
  encoding.id,
  new Fmp4Muxing({
    segmentLength,
    segmentNaming,
    initSegmentName,
    streams: [new MuxingStream({ streamId: videoStream1.id })],
    outputs: [
      new EncodingOutput({
        outputId,
        outputPath: `${outputPath}video/1024_1500000/fmp4/`,
        acl: [aclEntry],
      }),
    ],
  })
);
const videoMuxing2 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
  encoding.id,
  new Fmp4Muxing({
    segmentLength,
    segmentNaming,
    initSegmentName,
    streams: [new MuxingStream({ streamId: videoStream2.id })],
    outputs: [
      new EncodingOutput({
        outputId,
        outputPath: `${outputPath}video/768_1000000/fmp4/`,
        acl: [aclEntry],
      }),
    ],
  })
);
const videoMuxing3 = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
  encoding.id,
  new Fmp4Muxing({
    segmentLength,
    segmentNaming,
    initSegmentName,
    streams: [new MuxingStream({ streamId: videoStream3.id })],
    outputs: [
      new EncodingOutput({
        outputId: output.id,
        outputPath: `${outputPath}video/640_750000/fmp4/`,
        acl: [aclEntry],
      }),
    ],
  })
);

const audioMuxing = await bitmovinApi.encoding.encodings.muxings.fmp4.create(
  encoding.id,
  new Fmp4Muxing({
    segmentLength,
    segmentNaming,
    initSegmentName,
    streams: [new MuxingStream({ streamId: audioStream.id })],
    outputs: [
      new EncodingOutput({
        outputId,
        outputPath: `${outputPath}audio/128000/fmp4/`,
        acl: [aclEntry],
      }),
    ],
  })
);

const manifestOutput = new EncodingOutput({
  outputId,
  outputPath,
  acl: [
    new AclEntry({
      permission: AclPermission.PUBLIC_READ,
      scope: '*',
    }),
  ],
});

let dashManifest = new DashManifestDefault({
  manifestName: 'stream.mpd',
  encodingId: encoding.id,
  version: DashManifestDefaultVersion.V2,
  outputs: [manifestOutput],
});

dashManifest = await bitmovinApi.encoding.manifests.dash.default.create(
  dashManifest
);

let hlsManifest = new HlsManifestDefault({
  manifestName: 'stream.m3u8',
  encodingId: encoding.id,
  version: HlsManifestDefaultVersion.V1,
  outputs: [manifestOutput],
});

hlsManifest = await bitmovinApi.encoding.manifests.hls.default.create(
  hlsManifest
);

const startEncodingRequest = new StartEncodingRequest({
  manifestGenerator: ManifestGenerator.V2,
  vodDashManifests: [new ManifestResource({ manifestId: dashManifest.id })],
  vodHlsManifests: [new ManifestResource({ manifestId: hlsManifest.id })],
});

await bitmovinApi.encoding.encodings.start(encoding.id, startEncodingRequest);

app.get('/', (req, res) => {
  res.send(response);
});

app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
