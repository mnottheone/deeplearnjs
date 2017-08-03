/* Copyright 2017 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {GPGPUContext} from './gpgpu_context';
import * as unaryop_gpu from './unaryop_gpu';

function getLogUnaryOp(): string {
  return 'gl_FragColor = vec4(log(value), 0, 0, 0);';
}

export function getFragmentShaderSource(): string {
  return unaryop_gpu.getFragmentShaderSource(getLogUnaryOp());
}

export function log(
    gpgpu: GPGPUContext, logProgram: WebGLProgram, a: WebGLTexture,
    rows: number, columns: number, result: WebGLTexture) {
  unaryop_gpu.unaryOp(gpgpu, logProgram, a, rows, columns, result);
}

export function uploadLogDownload(
    a: Float32Array, rows: number, columns: number): Float32Array {
  return unaryop_gpu.uploadUnaryOpDownload(a, rows, columns, getLogUnaryOp());
}
