const stories={
  "0": {
    "label": "Nose cone",
    "category": "Recovery",
    "subtitle": "Light enough to recover on its own.",
    "description": "The hollow PETG nose cone uses an ogive profile chosen for aerodynamic efficiency. Its shoulders provide a friction fit inside the body tube. A nine-inch parachute is packed inside and attached to the cone. The cone ejects at 75% of peak altitude during descent, exposing the camera, and recovers separately. Simulation and calculation predict a terminal speed below 15 ft/s while tumbling without a working parachute.",
    "role": "Camera cover + separate recovery",
    "material": "PETG"
  },
  "1": {
    "label": "Upper body tube",
    "category": "Airframe",
    "subtitle": "The structure around the payload.",
    "description": "The upper body tube surrounds the payload hardware. The payload is the complete upper assembly, including the circuit boards, camera, batteries and antenna.",
    "role": "Payload airframe",
    "material": null
  },
  "2": {
    "label": "Lower body tube",
    "category": "Airframe",
    "subtitle": "The structure around the motor.",
    "description": "The lower body tube surrounds the motor and its mounting system.",
    "role": "Lower airframe",
    "material": null
  },
  "3": {
    "label": "Coupler reference envelope",
    "category": "Reference",
    "subtitle": "An earlier assembly envelope.",
    "description": "This simplified reference is retained for comparison and is excluded from the combined visual assembly.",
    "role": "Reference geometry",
    "material": null
  },
  "4": {
    "label": "Mount reference envelope",
    "category": "Reference",
    "subtitle": "An earlier assembly envelope.",
    "description": "This simplified reference is retained for comparison and is excluded from the combined visual assembly.",
    "role": "Reference geometry",
    "material": null
  },
  "5": {
    "label": "Motor",
    "category": "Propulsion",
    "subtitle": "The source of thrust.",
    "description": "The motor sits inside the removable mount and is secured by the threaded cap.",
    "role": "Propulsion",
    "material": null
  },
  "6": {
    "label": "Fin 1",
    "category": "Airframe",
    "subtitle": "Stability in flight.",
    "description": "The fins provide aerodynamic stability and seat in grooves in the motor mount.",
    "role": "Aerodynamic surface",
    "material": null
  },
  "7": {
    "label": "Fin 2",
    "category": "Airframe",
    "subtitle": "Stability in flight.",
    "description": "The fins provide aerodynamic stability and seat in grooves in the motor mount.",
    "role": "Aerodynamic surface",
    "material": null
  },
  "8": {
    "label": "Fin 3",
    "category": "Airframe",
    "subtitle": "Stability in flight.",
    "description": "The fins provide aerodynamic stability and seat in grooves in the motor mount.",
    "role": "Aerodynamic surface",
    "material": null
  },
  "9": {
    "label": "Fin 4",
    "category": "Airframe",
    "subtitle": "Stability in flight.",
    "description": "The fins provide aerodynamic stability and seat in grooves in the motor mount.",
    "role": "Aerodynamic surface",
    "material": null
  },
  "10": {
    "label": "Rail button 1",
    "category": "Launch interface",
    "subtitle": "Guided before free flight.",
    "description": "Two rail buttons along the body connect the rocket to the launch rail.",
    "role": "Launch-rail interface",
    "material": null
  },
  "11": {
    "label": "Rail button 2",
    "category": "Launch interface",
    "subtitle": "Guided before free flight.",
    "description": "Two rail buttons along the body connect the rocket to the launch rail.",
    "role": "Launch-rail interface",
    "material": null
  },
  "12": {
    "label": "Altimeter",
    "category": "Avionics",
    "subtitle": "A record of the flight.",
    "description": "The altimeter records altitude for inspection after the rocket is recovered.",
    "role": "Altitude recording",
    "material": null
  },
  "13": {
    "label": "Battery",
    "category": "Electrical",
    "subtitle": "Power on board.",
    "description": "The battery supplies electrical power to the onboard hardware.",
    "role": "Electrical power",
    "material": null
  },
  "14": {
    "label": "Camera mount",
    "category": "Payload",
    "subtitle": "Camera support and nose-cone separation.",
    "description": "The mount supports the camera on one side and provides a surface for the nose-cone ejection charge on the other. A divider separates the camera from the charge. The nose cone releases to uncover the camera, then descends on its own parachute.",
    "role": "Camera support + ejection interface",
    "material": null
  },
  "15": {
    "label": "Camera",
    "category": "Payload",
    "subtitle": "A view from the rocket.",
    "description": "The onboard camera sits within the forward assembly.",
    "role": "Onboard imaging",
    "material": null
  },
  "16": {
    "label": "Internal coupler",
    "category": "Airframe",
    "subtitle": "Joining the body sections.",
    "description": "The coupler sits inside the body, connecting the surrounding tube sections and locating the internal assembly.",
    "role": "Body connection",
    "material": null
  },
  "17": {
    "label": "Camera holder",
    "category": "Payload",
    "subtitle": "Holding the camera in place.",
    "description": "The camera holder supports the camera within the forward assembly.",
    "role": "Camera support",
    "material": null
  },
  "18": {
    "label": "Motor mount",
    "category": "Motor retention",
    "subtitle": "A motor mount you can replace.",
    "description": "The PETG mount works with a threaded cap to hold the motor mechanically, without relying on a friction fit. A locating flange sets its insertion depth and transfers thrust into the body tube. Grooves let the fins seat in the mount without adhesive. Remove eight screws and the mount slides out through the back of the rocket for replacement.",
    "role": "Motor retention + thrust transfer",
    "material": "3D-printed PETG"
  },
  "19": {
    "label": "Motor screw cap",
    "category": "Motor retention",
    "subtitle": "Securing the motor from the rear.",
    "description": "The cap screws onto the motor mount to hold the motor in place.",
    "role": "Motor retention",
    "material": null
  },
  "20": {
    "label": "Antenna",
    "category": "Communications",
    "subtitle": "The onboard antenna.",
    "description": "The antenna sits within the forward assembly, supported by its own holder.",
    "role": "Antenna",
    "material": null
  },
  "21": {
    "label": "Wooden rod 1",
    "category": "Internal structure",
    "subtitle": "Support through the assembly.",
    "description": "The wooden rods form part of the internal support structure.",
    "role": "Internal support",
    "material": null
  },
  "22": {
    "label": "Antenna holder",
    "category": "Communications",
    "subtitle": "Keeping the antenna in position.",
    "description": "This holder locates and supports the antenna within the internal assembly.",
    "role": "Antenna support",
    "material": null
  },
  "23": {
    "label": "Top PCB holder",
    "category": "Avionics",
    "subtitle": "Locating the electronics.",
    "description": "This holder supports the circuit-board arrangement at its station within the internal assembly.",
    "role": "Circuit-board support",
    "material": null
  },
  "24": {
    "label": "Middle PCB holder",
    "category": "Avionics",
    "subtitle": "Locating the electronics.",
    "description": "This holder supports the circuit-board arrangement at its station within the internal assembly.",
    "role": "Circuit-board support",
    "material": null
  },
  "25": {
    "label": "Bottom PCB holder",
    "category": "Avionics",
    "subtitle": "Locating the electronics.",
    "description": "This holder supports the circuit-board arrangement at its station within the internal assembly.",
    "role": "Circuit-board support",
    "material": null
  },
  "26": {
    "label": "Lower shock-cord mount",
    "category": "Recovery",
    "subtitle": "Connecting recovery to the airframe.",
    "description": "The lower shock-cord mount connects the recovery system to the rocket structure.",
    "role": "Shock-cord attachment",
    "material": null
  },
  "27": {
    "label": "Wooden rod 2",
    "category": "Internal structure",
    "subtitle": "Support through the assembly.",
    "description": "The wooden rods form part of the internal support structure.",
    "role": "Internal support",
    "material": null
  },
  "28": {
    "label": "Wooden rod 3",
    "category": "Internal structure",
    "subtitle": "Support through the assembly.",
    "description": "The wooden rods form part of the internal support structure.",
    "role": "Internal support",
    "material": null
  },
  "29": {
    "label": "Wooden rod 4",
    "category": "Internal structure",
    "subtitle": "Support through the assembly.",
    "description": "The wooden rods form part of the internal support structure.",
    "role": "Internal support",
    "material": null
  }
};
export function storyFor(part){return stories[part.id];}
