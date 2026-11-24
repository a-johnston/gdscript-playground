extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		push_error("Usage: godot --headless --script tools/pack_runner.gd -- <runner-dir> <output.pck>")
		quit(1)
		return
	var pack := PCKPacker.new()
	var error := pack.pck_start(args[1])
	if error == OK:
		for file in ["project.godot", "runner.tscn", "runner.gd"]:
			error = pack.add_file("res://" + file, args[0].path_join(file))
			if error != OK:
				break
	if error == OK:
		error = pack.add_file_from_buffer(
			"res://.godot/global_script_class_cache.cfg",
			"list=Array[Dictionary]([])\n".to_utf8_buffer()
		)
	if error == OK:
		error = pack.flush()
	if error != OK:
		push_error("Could not write runner PCK: " + error_string(error))
	quit(0 if error == OK else 1)
