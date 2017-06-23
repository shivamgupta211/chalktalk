"use strict";

var SketchAnimation = (function() {
   let a = {};

   // https://stackoverflow.com/a/17096947/7361580

   a.LINE = function(args, fractionComplete) {
      const start = args.start;
      const end = args.end;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      return [
         start.x + (dx * fractionComplete),
         start.y + (dy * fractionComplete),
         start.z + (dz * fractionComplete)
      ];
   };

   function _cubic(fc, a, b, c, d) {
      let t2 = fc * fc;
      let t3 = t2 * fc;
      return a + (-a * 3 + fc * (3 * a - a * fc)) * fc +
            (3 * b + fc * (-6 * b + b * 3 * fc)) * fc +
            (c * 3 - c * 3 * fc) * t2 +
            d * t3;
   }

   a.BEZIER_CUBIC = function(args, fractionComplete) {
      const start = args.start;
      const end = args.end;
      const c1 = args.control1;
      const c2 = args.control2;

      return [
         _cubic(fractionComplete, start.x, c1.x, c2.x, end.x),
         _cubic(fractionComplete, start.y, c1.y, c2.y, end.y),
         _cubic(fractionComplete, start.z, c1.z, c2.z, end.z)
      ];
   };

   a.Type = {};
   a.Type.LINE = function(args) {
      return function(UNUSED, fractionComplete) {
         const start = args.start;
         const end = args.end;

         const dx = end.x - start.x;
         const dy = end.y - start.y;
         const dz = end.z - start.z;
         return [
            start.x + (dx * fractionComplete),
            start.y + (dy * fractionComplete),
            start.z + (dz * fractionComplete)
         ];            
      }
   };


   // Thank you Daniel Zhang for sharing this: https://medium.com/analytic-animations/the-spring-factory-4c3d988e7129
   
   function clamp(x, _min, _max) {
      return min(max(x, _min), _max);
   }

   function nvl(x, ifNull) {
      return x === undefined || x === null ? ifNull : x;
   }

   function computeOmega(A, B, k, zeta) {
      if (A * B < 0 && k >= 1) {
         k--;
      }

      return (-atan(A / B) + PI * k) / (2 * PI * sqrt(1 - zeta * zeta));
   }

   function numericallySolveOmegaAndB(args) {
      args = args || {};

      let zeta = args.zeta;
      let k = args.k;
      let y0 = nvl(args.y0, 1);
      v0 = args.v0 || 0;

      function errorfn(B, omega) {
         let omegaD = omega * sqrt(1 - zeta * zeta);
         return B - ((zeta * omega * y0) + v0) / omegaD;
      }

      let A = y0;
      let B = zeta;
      let omega = 0;
      let error = 0;
      let direction = 0;

      function step() {
         omega = computeOmega(A, B, k, zeta);
         error = errorfn(B, omega);
         direction = -Math.sign(error);
      }

      step();

      let tolerance = 1e-6;
      let lower = 0;
      let upper = 0;

      let ct = 0;
      let maxct = 1e3;

      if (direction > 0) {
         while (direction > 0) {
            ct++;

            if (ct > maxct) {
               break;
            }

            lower = B;

            B *= 2;
            step();
         }
         upper = B;
      }
      else {
         upper = B;
         B *= -1;

         while (direction < 0) {
            ct++;

            if (ct > maxct) {
               break;
            }

            lower = B;

            B *= 2;
            step();
         }
         lower = B;
      }

      while (abs(error) > tolerance) {
         ct++;

         if (ct > maxct) {
            break;
         }

         B = (upper + lower) / 2;
         step();

         if (direction > 0) {
            lower = B;
         }
         else {
            upper = B;
         }
      }

      return {
         omega : omega,
         B : B
      };
   }

   a.Type.SPRING = function(args) {
      args = args || {};

      let zeta = args.damping;
      let k = args.halfCycles;
      let y0 = nvl(args.startY, 1);
      let v0 = args.initialVelocity || 0;

      let A = y0;
      let B = 0;
      let omega = 0;

      if (abs(v0) < 1e-6) {
         B = zeta * y0 / sqrt(1 - zeta * zeta);
         omega = computeOmega(A, B, k, zeta);
      }
      else {
         let result = numericallySolveOmegaAndB({
            zeta : zeta,
            k : k,
            y0, y0,
            v0, v0
         });

         B = result.B;
         omega = result.omega;
      }

      omega *= 2 * PI;
      let omegaD = omega * sqrt(1 - zeta * zeta);

      let x = args.startX || 0;
      let z = args.startZ || 0;

      return function(UNUSED, fractionComplete) {
         let t = fractionComplete;
         let sinusoid = A * cos(omegaD * t) + B * sin(omegaD * t);
         return [
            x,
            (exp(-t * zeta * omega) * sinusoid),
            z,
         ];
      };
   }

   a.Type.BOUNCE = function(args) {
      args = args || {};

      let startY = args.startY;
      let endY = args.endY;
      let delta = endY - startY;

      let numBounces = args.numBounces;
      let threshold = args.threshold || 0.001;

      function energyToHeight(energy) {
         return energy; // h = E/mg
      }

      function heightToEnergy(height) {
         return height; // E = mgh
      }

      function bounceTime(height) {
         return 2 * sqrt(2 * height); // 2 * half bounce time measured from peak
      }

      function speed(energy) {
         return sqrt(2 * energy); // E = 1/2 m v^2, s = |sqrt(2E/m)|
      }

      let height = 1;
      let potential = heightToEnergy(height);
      let elasticity = pow(threshold, 1 / numBounces);

      // critical points mark contact with ground

      let criticalPoints = [{
         time : -bounceTime(height) / 2,
         energy : potential  
      },
      {
         time : bounceTime(height) / 2,
         energy : potential * elasticity
      }];

      potential *= elasticity;
      height = energyToHeight(potential);

      let localTime = criticalPoints[1].time;
      for (let i = 1; i < numBounces; i++) {
         localTime += bounceTime(height);
         potential *= elasticity; // remove energy following each bounce

         criticalPoints.push({
            time : localTime,
            energy : potential
         });

         height = energyToHeight(potential);
      }

      let duration = localTime;

      let x = args.endX || 0;
      let z = args.endZ || 0;

      let velocityX = args.velocityX;

      return function(UNUSED, fractionComplete) {
         let t = clamp(fractionComplete, 0, 1);
         let tAdj = t * duration;

         if (tAdj === 0) {
            return [x, 0, z];
         }
         else if (tAdj >= duration) {
            return [x, 1, z];
         }

         function findBouncePointAbove(arr, val) {
            let idx = 1;
            for (let idx = 0; idx < arr.length; idx++) {
               if (criticalPoints[idx].time > val) {
                  return idx;
               }
            }
            return arr.length;           
         }

         let idx = findBouncePointAbove(criticalPoints, tAdj);
         let bouncePoint = criticalPoints[idx - 1];

         tAdj -= bouncePoint.time;

         let v0 = speed(bouncePoint.energy);
         let pos = v0 * tAdj + -0.5 * tAdj * tAdj;

         return [
            (velocityX === undefined) ? x : velocityX * t + x,
            startY + (1 - pos) * delta,
            z
         ];
      }
   }
   
   a.Animation = function(stepProcedure, args, timeToCompleteSeconds, doProvideElapsed) {
      let that = this;
      this.prevTime = time;
      this.args = args;
      this.timeToComplete = timeToCompleteSeconds;
      this.elapsedTime = 0;
      this.stepProcedure = stepProcedure;
      this.isReversed = false;

      if (doProvideElapsed === undefined || !doProvideElapsed) {
         this.step = function() {
            let currTime = time;
            let dT = currTime - this.prevTime;
            this.prevTime = currTime;
            this.elapsedTime += dT;

            let fin = false;
            if (this.elapsedTime >= this.timeToComplete) {
               this.elapsedTime = this.timeToComplete;
               fin = true;
            }

            let fractionComplete = this.elapsedTime / this.timeToComplete;
            let nextPt = this.stepProcedure(this.args, (this.isReversed) ? 1 - fractionComplete : fractionComplete);
            
            return {point : nextPt, finished : fin};
         };
      }
      else {
         this.step = function(elapsed) {
            this.elapsedTime += elapsed;

            let fin = false;
            if (this.elapsedTime >= this.timeToComplete) {
               this.elapsedTime = this.timeToComplete;
               fin = true;
            }

            let fractionComplete = this.elapsedTime / this.timeToComplete;
            let nextPt = this.stepProcedure(this.args, (this.isReversed) ? 1 - fractionComplete : fractionComplete);
            
            return {point : nextPt, finished : fin};
         };         
      }

      this.reset = function() {
         this.prevTime = time;
         this.elapsedTime = 0;
      };

      this.reverse = function() {
         this.isReversed = !this.isReversed;
      };
   };

   // a.Synchronizer = function(animations) {
   //    this.animations = [];
   //    for (let i = 0; i < animations.length; i++) {
   //       this.animations.push({
   //          animation :,
   //          point : null,
   //          finished  : false
   //       });
   //    }

   //    this.step = function(elapsed) {
   //       let fin = true;
   //       for (let i = 0; i < this.animations.length; i++) {
   //          let aniI = this.animations[i];
   //          if (aniI.finished) {
   //             continue;
   //          }
   //          else {
   //             fin = false;
   //          }

   //          // STEP EACH INCOMPLETE ANIMATION
   //          let status = aniI.step(elapsed);

   //          if (status.finished) {
   //             aniI.finished = true;
   //          }
   //       }
   //    };

   //    this.resetAll = function() {
   //       for (let i = 0; i < this.animations.length; i++) {
   //          this.animations[i].finished = false;
   //       }         
   //    };
   // }

   a.Path = a.Animation;

   return a;
})();