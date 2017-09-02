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

import {Node} from './graph';
import {NDArrayMath} from './math/math';
import {Scalar} from './math/ndarray';
import {AdagradOptimizer} from './adagrad_optimizer';
import {SessionRuntime} from './session';
import {TensorArrayMap, SummedTensorArrayMap} from './tensor_array_map';

export class RmspropOptimizer extends AdagradOptimizer {
  constructor(protected learningRate: number,
    protected momentum: number, private gamma: number,
    specifiedVariableList?: Node[]) {
    super(learningRate, momentum, specifiedVariableList);
  }

  beforeBatch(
    math: NDArrayMath, batchSize: number, runtime: SessionRuntime,
    activationArrayMap: TensorArrayMap,
    gradientArrayMap: SummedTensorArrayMap) {
    super.beforeBatch(math, batchSize, runtime,
      activationArrayMap, gradientArrayMap);

    this.g = Scalar.new(this.gamma);
  }


  afterBatch(
      math: NDArrayMath, batchSize: number, runtime: SessionRuntime,
      activationArrayMap: TensorArrayMap,
      gradientArrayMap: SummedTensorArrayMap) {
    math.scope((keep) => {
      this.variableNodes.forEach(node => {
        const oldVariable = activationArrayMap.get(node.output);
        const gradient = this.variableGradients.get(node.output);
        const oldCache = this.cache.get(node.output);
        const gradientSquare = math.multiply(gradient, gradient);
        const cache = math.scaledArrayAdd(this.g!, oldCache,
          math.sub(this.one, this.g)!, gradientSquare);
        const variable = math.scaledArrayAdd(this.c!,
          math.divide( gradient, math.sqrt( math.add(cache, this.eps))),
              this.one!, oldVariable);
        this.cache.set(node.output, keep(cache));
        activationArrayMap.set(node.output, keep(variable));
        node.data = variable;

        oldVariable.dispose();
        oldCache.dispose();
      });
    });

    this.variableGradients.dispose();
    this.variableGradients = new TensorArrayMap();
  }

  dispose() {
    if (this.c != null) {
      this.c.dispose();
    }
    if (this.m != null) {
      this.m.dispose();
    }
    this.one.dispose();
    this.cache.dispose();
  }

  setMomentum(momentum: number) {
    this.momentum = momentum;
  }
  private g: Scalar;
}
