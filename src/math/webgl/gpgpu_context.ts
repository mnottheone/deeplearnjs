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

import * as gpgpu_util from './gpgpu_util';
import * as tex_util from './tex_util';
import * as webgl_util from './webgl_util';

import {WebGLLoseContextExtension} from './webgl_util';

export class GPGPUContext {
  gl: WebGLRenderingContext;
  textureFloatExtension: {};
  colorBufferFloatExtension: {};
  loseContextExtension: WebGLLoseContextExtension;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  framebuffer: WebGLFramebuffer;
  outputTexture: WebGLTexture|null = null;
  program: WebGLProgram|null = null;
  private disposed = false;
  private autoDebugValidate = false;

  constructor(gl?: WebGLRenderingContext) {
    if (gl != null) {
      this.gl = gl;
    } else {
      this.gl = gpgpu_util.createWebGLContext();
    }

    // WebGL 2.0 enables texture floats without an extension.
    if (!webgl_util.isWebGL2Enabled()) {
      this.textureFloatExtension =
          webgl_util.getExtensionOrThrow(this.gl, 'OES_texture_float');
    } else {
      this.colorBufferFloatExtension =
          webgl_util.getExtensionOrThrow(this.gl, 'EXT_color_buffer_float');
    }

    this.loseContextExtension =
        webgl_util.getExtensionOrThrow(this.gl, 'WEBGL_lose_context') as
        WebGLLoseContextExtension;
    this.vertexBuffer = gpgpu_util.createVertexBuffer(this.gl);
    this.indexBuffer = gpgpu_util.createIndexBuffer(this.gl);
    this.framebuffer = webgl_util.createFramebuffer(this.gl);
  }

  public dispose() {
    this.throwIfDisposed();
    if (this.program != null) {
      console.warn(
          'Disposing a GPGPUContext that still has a bound WebGLProgram.' +
          ' This is probably a resource leak, delete the program with ' +
          'GPGPUContext.deleteProgram before disposing.');
    }
    if (this.outputTexture != null) {
      console.warn(
          'Disposing a GPGPUContext that still has a bound output matrix ' +
          'texture.  This is probably a resource leak, delete the output ' +
          'matrix texture with GPGPUContext.deleteMatrixTexture before ' +
          'disposing.');
    }
    const gl = this.gl;
    webgl_util.callAndCheck(gl, () => gl.finish());
    webgl_util.callAndCheck(gl, () => gl.bindFramebuffer(gl.FRAMEBUFFER, null));
    webgl_util.callAndCheck(gl, () => gl.deleteFramebuffer(this.framebuffer));
    webgl_util.callAndCheck(gl, () => gl.bindBuffer(gl.ARRAY_BUFFER, null));
    webgl_util.callAndCheck(gl, () => gl.deleteBuffer(this.vertexBuffer));
    webgl_util.callAndCheck(
        gl, () => gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null));
    webgl_util.callAndCheck(gl, () => gl.deleteBuffer(this.indexBuffer));
    this.loseContextExtension.loseContext();
    this.disposed = true;
  }

  public enableAutomaticDebugValidation(enabled: boolean) {
    this.autoDebugValidate = enabled;
    webgl_util.enableDebugWebGLErrorChecking(enabled);
  }

  public createMatrixTexture(rows: number, columns: number): WebGLTexture {
    this.throwIfDisposed();
    return gpgpu_util.createMatrixTexture(this.gl, rows, columns);
  }

  public uploadPixelDataToTexture(
      texture: WebGLTexture,
      pixels: ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement) {
    this.throwIfDisposed();
    gpgpu_util.uploadPixelDataToTexture(this.gl, texture, pixels);
  }

  public createPackedMatrixTexture(rows: number, columns: number):
      WebGLTexture {
    this.throwIfDisposed();
    return gpgpu_util.createPackedMatrixTexture(this.gl, rows, columns);
  }

  public deleteMatrixTexture(texture: WebGLTexture) {
    this.throwIfDisposed();
    if (this.outputTexture === texture) {
      webgl_util.unbindColorTextureFromFramebuffer(this.gl, this.framebuffer);
      this.outputTexture = null;
    }
    webgl_util.callAndCheck(this.gl, () => this.gl.deleteTexture(texture));
  }

  public uploadMatrixToTexture(
      texture: WebGLTexture, rows: number, columns: number,
      matrix: Float32Array) {
    this.throwIfDisposed();
    const numChannels = 1;
    return gpgpu_util.uploadMatrixToTexture(
        this.gl, texture, rows, columns, matrix, numChannels);
  }

  public uploadMatrixToPackedTexture(
      texture: WebGLTexture, rows: number, columns: number,
      matrix: Float32Array) {
    this.throwIfDisposed();
    return gpgpu_util.uploadMatrixToPackedTexture(
        this.gl, texture, rows, columns, matrix);
  }

  public downloadMatrixFromTexture(
      texture: WebGLTexture, rows: number, columns: number): Float32Array {
    return this.downloadMatrixDriver(
        texture,
        () =>
            gpgpu_util.downloadMatrixFromOutputTexture(this.gl, rows, columns));
  }

  public downloadMatrixFromPackedTexture(
      texture: WebGLTexture, rows: number, columns: number): Float32Array {
    return this.downloadMatrixDriver(
        texture,
        () => gpgpu_util.downloadMatrixFromPackedOutputTexture(
            this.gl, rows, columns));
  }

  public createProgram(fragmentShaderSource: string): WebGLProgram {
    this.throwIfDisposed();
    const gl = this.gl;
    const fragmentShader: WebGLShader =
        webgl_util.createFragmentShader(gl, fragmentShaderSource);
    const vertexShader: WebGLShader = gpgpu_util.createVertexShader(gl);
    const program: WebGLProgram = webgl_util.createProgram(gl);
    webgl_util.callAndCheck(gl, () => gl.attachShader(program, vertexShader));
    webgl_util.callAndCheck(gl, () => gl.attachShader(program, fragmentShader));
    webgl_util.linkProgram(gl, program);
    if (this.autoDebugValidate) {
      webgl_util.validateProgram(gl, program);
    }

    return program;
  }

  public deleteProgram(program: WebGLProgram) {
    this.throwIfDisposed();
    if (program === this.program) {
      this.program = null;
    }
    if (program != null) {
      webgl_util.callAndCheck(this.gl, () => this.gl.deleteProgram(program));
    }
  }

  public setProgram(program: WebGLProgram|null) {
    this.throwIfDisposed();
    this.program = program;
    if ((this.program != null) && this.autoDebugValidate) {
      webgl_util.validateProgram(this.gl, this.program);
    }
    webgl_util.callAndCheck(this.gl, () => this.gl.useProgram(program));
  }

  public getUniformLocation(uniformName: string): WebGLUniformLocation {
    this.throwIfDisposed();
    this.throwIfNoProgram();
    return webgl_util.getProgramUniformLocationOrThrow(
        this.gl, this.program, uniformName);
  }

  public setInputMatrixTexture(
      inputMatrixTexture: WebGLTexture, uniformName: string,
      textureUnit: number) {
    this.throwIfDisposed();
    this.throwIfNoProgram();
    webgl_util.bindTextureToProgramUniformSampler(
        this.gl, this.program, inputMatrixTexture, uniformName, textureUnit);
  }

  public setOutputMatrixTexture(
      outputMatrixTexture: WebGLTexture, rows: number, columns: number) {
    this.setOutputMatrixTextureDriver(outputMatrixTexture, columns, rows);
  }

  public setOutputPackedMatrixTexture(
      outputPackedMatrixTexture: WebGLTexture, rows: number, columns: number) {
    this.throwIfDisposed();
    const [width, height] =
        tex_util.getPackedMatrixTextureShapeWidthHeight(rows, columns);
    this.setOutputMatrixTextureDriver(outputPackedMatrixTexture, width, height);
  }

  public setOutputMatrixWriteRegion(
      startRow: number, numRows: number, startColumn: number,
      numColumns: number) {
    this.setOutputMatrixWriteRegionDriver(
        startColumn, startRow, numColumns, numRows);
  }

  public setOutputPackedMatrixWriteRegion(
      startRow: number, numRows: number, startColumn: number,
      numColumns: number) {
    throw new Error('setOutputPackedMatrixWriteRegion not implemented.');
  }

  public debugValidate() {
    if (this.program != null) {
      webgl_util.validateProgram(this.gl, this.program);
    }
    webgl_util.validateFramebuffer(this.gl);
  }

  public executeProgram() {
    this.throwIfDisposed();
    this.throwIfNoProgram();
    const gl = this.gl;
    gpgpu_util.bindVertexProgramAttributeStreams(
        gl, this.program, this.vertexBuffer);
    if (this.autoDebugValidate) {
      this.debugValidate();
    }
    webgl_util.callAndCheck(
        gl, () => gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0));
  }

  public blockUntilAllProgramsCompleted() {
    this.throwIfDisposed();
    webgl_util.callAndCheck(this.gl, () => this.gl.finish());
  }

  private downloadMatrixDriver(
      texture: WebGLTexture,
      downloadAndDecode: () => Float32Array): Float32Array {
    this.throwIfDisposed();
    webgl_util.bindColorTextureToFramebuffer(
        this.gl, texture, this.framebuffer);
    const result = downloadAndDecode();
    if (this.outputTexture != null) {
      webgl_util.bindColorTextureToFramebuffer(
          this.gl, this.outputTexture, this.framebuffer);
      if (this.autoDebugValidate) {
        webgl_util.validateFramebuffer(this.gl);
      }
    } else {
      webgl_util.unbindColorTextureFromFramebuffer(this.gl, this.framebuffer);
    }
    return result;
  }

  private setOutputMatrixTextureDriver(
      outputMatrixTextureMaybePacked: WebGLTexture, width: number,
      height: number) {
    this.throwIfDisposed();
    const gl = this.gl;
    webgl_util.bindColorTextureToFramebuffer(
        gl, outputMatrixTextureMaybePacked, this.framebuffer);
    if (this.autoDebugValidate) {
      webgl_util.validateFramebuffer(gl);
    }
    this.outputTexture = outputMatrixTextureMaybePacked;
    webgl_util.callAndCheck(gl, () => gl.viewport(0, 0, width, height));
    webgl_util.callAndCheck(gl, () => gl.scissor(0, 0, width, height));
  }

  private setOutputMatrixWriteRegionDriver(
      x: number, y: number, width: number, height: number) {
    this.throwIfDisposed();
    webgl_util.callAndCheck(
        this.gl, () => this.gl.scissor(x, y, width, height));
  }

  private throwIfDisposed() {
    if (this.disposed) {
      throw new Error('Attempted to use disposed GPGPUContext.');
    }
  }

  private throwIfNoProgram() {
    if (this.program == null) {
      throw new Error('No GPU program is currently set.');
    }
  }
}
